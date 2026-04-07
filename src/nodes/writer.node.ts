import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import {
	addTopicNote,
	claimNextPendingArticleTask,
	completeArticleTask,
	insertGeneratedArticle,
	searchTopicNotes,
	setCandidateStatus,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { loadConfig } from "../config.ts";
import { compactText, slugify, stripLeadingTopicLabel } from "../utils.ts";
import { scrapeUrl } from "../tools/scraper.tool.ts";
import type { GeneratedArticle } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";
import {
	enforceQuotesForCopiedText,
	findVerbatimSentenceMatches,
	isOfficialTopicSourceUrl,
} from "../editorial-policy.ts";
import { loadRuntimeTopicProfiles } from "../topics/runtime.ts";

const config = loadConfig();
const MAX_TASKS_PER_RUN = 3;
const MAX_SOURCE_TEXT = 5000;

const writerOutputSchema = z.object({
	title: z.string(),
	content: z.string(),
	categories: z.array(z.string()).default([]),
});

const prompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are the writer agent for a developer-focused tech news website.
Write a complete article in 300-500 words with:
- A clear headline
- Key facts and practical developer impact
- Neutral, informative tone
- Short paragraphs separated by blank lines
- Each paragraph should be 3-5 sentences and easy to scan
- Never return the whole article as one large paragraph
- A short call to action at the end (for example: read release notes, patch now, or review migration steps)
- Do not prepend the topic or language name to the headline unless it is required for clarity
Knowledge base policy:
- Knowledge base notes are short memory cues, not canonical source text.
- Use them only as compact background hints that can guide verification.
- Never treat knowledge base notes as full article content or quote them verbatim.
Do not invent facts and do not include markdown links.`,
	],
	[
		"human",
		`Topic: {topicName}
Candidate title: {candidateTitle}
Candidate URL: {candidateUrl}
Candidate snippet: {candidateSnippet}

Editor notes:
{editorNotes}

Knowledge base notes:
{knowledgeNotes}

Originality check feedback:
{originalityFeedback}

Source content:
{sourceContent}`,
	],
]);

const formatToday = () => new Date().toISOString().split("T")[0].replace(/-/g, "/");

const summarizeNotes = (notes: string[]): string => {
	if (notes.length === 0) return "No knowledge base notes found.";
	return notes.slice(0, 6).map((note) => compactText(note, 180)).join("\n\n---\n\n");
};

const sanitizeEditorNotes = (editorNotes: string, topicName: string): string =>
	editorNotes.replace(
		/^Candidate title:\s*(.+)$/m,
		(_match, rawTitle: string) =>
			`Candidate title: ${stripLeadingTopicLabel(rawTitle, topicName)}`,
	);

export const writerNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const startedAt = Date.now();
	const llm = makeLlm(0.3).withStructuredOutput(writerOutputSchema);
	const chain = prompt.pipe(llm);
	const publishedArticles: GeneratedArticle[] = [];
	let attemptedTasks = 0;
	const topicProfiles = await loadRuntimeTopicProfiles();
	const profileBySlug = new Map(topicProfiles.map((profile) => [profile.slug, profile]));

	logger.info({ maxTasks: MAX_TASKS_PER_RUN }, "writer: starting");

	for (let i = 0; i < MAX_TASKS_PER_RUN; i++) {
		const task = await claimNextPendingArticleTask();
		if (!task) {
			logger.info({ iteration: i + 1 }, "writer: no more pending tasks");
			break;
		}

		attemptedTasks++;
		logger.info(
			{ taskId: task.id, topic: task.topic_slug, priority: task.priority },
			"writer: claimed task",
		);

		try {
			const topicProfile = profileBySlug.get(task.topic_slug);
			if (!isOfficialTopicSourceUrl(topicProfile, task.candidate_url)) {
				logger.warn(
					{ taskId: task.id, topic: task.topic_slug, url: task.candidate_url },
					"writer: rejected queued task because candidate is not from an official source",
				);
				await completeArticleTask(task.id, "failed");
				await setCandidateStatus(task.candidate_id, "rejected", 0,
					"Rejected by writer safety check: queued task is not in this topic's official source allowlist.");
				continue;
			}

			const scraped = await scrapeUrl(task.candidate_url);
			const sourceContent = scraped.ok
				? scraped.content.slice(0, MAX_SOURCE_TEXT)
				: task.candidate_snippet;
			const cleanCandidateTitle = stripLeadingTopicLabel(
				task.candidate_title,
				task.topic_name,
			);
			logger.debug(
				{ taskId: task.id, scraped: scraped.ok, sourceChars: sourceContent.length },
				"writer: source prepared",
			);

			const kbNotes = (await searchTopicNotes(task.topic_slug, cleanCandidateTitle, 6)).filter((note) =>
				note.source_url ? isOfficialTopicSourceUrl(topicProfile, note.source_url) : true
			);
			const knowledgeNotes = summarizeNotes(kbNotes.map((n) => n.content));
			const editorNotes = sanitizeEditorNotes(task.editor_notes, task.topic_name);

			let result = await chain.invoke({
				topicName: task.topic_name,
				candidateTitle: cleanCandidateTitle,
				candidateUrl: task.candidate_url,
				candidateSnippet: task.candidate_snippet,
				editorNotes,
				knowledgeNotes,
				originalityFeedback:
					"Use original wording. If a direct quote is essential, keep it short and wrap it in double quotes.",
				sourceContent,
			});

			let copiedSentences = findVerbatimSentenceMatches(result.content, sourceContent);
			if (copiedSentences.length > 0) {
				logger.warn(
					{ taskId: task.id, copiedSentences: copiedSentences.length },
					"writer: detected verbatim source overlap, requesting rewrite",
				);

				result = await chain.invoke({
					topicName: task.topic_name,
					candidateTitle: cleanCandidateTitle,
					candidateUrl: task.candidate_url,
					candidateSnippet: task.candidate_snippet,
					editorNotes,
					knowledgeNotes,
					originalityFeedback: [
						`Previous draft copied ${copiedSentences.length} sentence(s) from source text.`,
						"Rewrite using original phrasing.",
						"If you keep any exact source sentence, it must be a short quote in double quotes.",
					].join(" "),
					sourceContent,
				});

				copiedSentences = findVerbatimSentenceMatches(result.content, sourceContent);
			}

			const originalityGuard = enforceQuotesForCopiedText(result.content, sourceContent);
			if (originalityGuard.copiedSentenceCount > 0) {
				logger.warn(
					{
						taskId: task.id,
						copiedSentences: originalityGuard.copiedSentenceCount,
						quotedSentences: originalityGuard.quotedSentenceCount,
					},
					"writer: applied quote guard for copied source text",
				);
			}

			const articleTitle = stripLeadingTopicLabel(result.title, task.topic_name);
			const slug = slugify(articleTitle);
			const url = `/articles/${formatToday()}/${slug}/`;
			const inserted = await insertGeneratedArticle(
				task.id,
				task.topic_id,
				articleTitle,
				originalityGuard.content,
				slug,
				url,
				config.GROQ_MODEL,
			);

			await completeArticleTask(task.id, "completed");
			await setCandidateStatus(task.candidate_id, "published");
			logger.info(
				{ taskId: task.id, articleTitle, inserted: Boolean(inserted) },
				"writer: task completed",
			);
			await addTopicNote(
				task.topic_slug,
				"summary",
				[
					`Published: ${articleTitle}`,
					`Angle: ${compactText(editorNotes, 160)}`,
					`Takeaway: ${compactText(originalityGuard.content, 180)}`,
				].join("\n"),
				task.candidate_url,
				"writer-agent",
			);

			if (inserted) {
				publishedArticles.push(inserted);
			}
		} catch (err) {
			logger.error({ err, taskId: task.id }, "writer: failed task");
			await completeArticleTask(task.id, "failed");
			await setCandidateStatus(task.candidate_id, "writer-error");
		}
	}

	logger.info(
		{ attemptedTasks, written: publishedArticles.length, durationMs: Date.now() - startedAt },
		"writer: finished",
	);

	return {
		publishedArticles,
		metrics: {
			...(state.metrics ?? { scanned: 0, reviewed: 0, tasksCreated: 0, written: 0 }),
			written: publishedArticles.length,
			tasksCreated: state.metrics?.tasksCreated ?? 0,
			reviewed: state.metrics?.reviewed ?? 0,
			scanned: state.metrics?.scanned ?? 0,
		},
	};
};
