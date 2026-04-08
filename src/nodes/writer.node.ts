import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import {
	addTopicNote,
	claimNextPendingArticleTask,
	completeArticleTask,
	insertGeneratedArticle,
	setCandidateStatus,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { loadConfig } from "../config.ts";
import { compactText, slugify, stripLeadingTopicLabel } from "../utils.ts";
import { scrapeUrl } from "../tools/scraper.tool.ts";
import { knowledgeBaseTool } from "../tools/knowledge-base.tool.ts";
import type { GeneratedArticle } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";
import {
	isOfficialTopicSourceUrl,
} from "../editorial-policy.ts";
import { findTopicProfile, loadRuntimeTopicProfiles } from "../topics/runtime.ts";

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
Originality requirements:
- Never copy source sentences verbatim
- Rewrite all source information in original phrasing
- Avoid sentence-level overlap with the source text
- If a direct quote is essential, keep only one short quote (max 20 words) wrapped in double quotes
Content quality requirements:
- Do not produce thin summaries; explain what changed and why it matters to developers
- Use background context and editor notes to add relevant technical details when they are available
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

Background context:
{backgroundContext}

Originality check feedback:
{originalityFeedback}

Source content:
{sourceContent}`,
	],
]);

const formatToday = () => new Date().toISOString().split("T")[0].replace(/-/g, "/");

const fetchKbContext = async (topicSlug: string, query: string): Promise<string> => {
	const researchLlm = makeLlm(0).bindTools([knowledgeBaseTool]);
	const response = await researchLlm.invoke([
		new SystemMessage(
			"You are preparing background context for a tech news article. " +
			"Call get_topic_knowledge with action='search' if topic-specific facts would improve article accuracy. " +
			"If notes are clearly irrelevant or stale for this topic, you may call get_topic_knowledge with action='deactivate_matching' and a short cleanup reason. " +
			"Skip tool calls if the article is self-contained.",
		),
		new HumanMessage(`Topic: ${topicSlug}. Article: ${query}`),
	]);
	const toolCalls = (response as AIMessage).tool_calls ?? [];
	if (toolCalls.length === 0) return "None.";
	const results = await Promise.all(
		toolCalls.map((tc) =>
			knowledgeBaseTool.invoke(tc.args as { slug: string; query?: string })
		),
	);
	return results.filter(Boolean).join("\n\n") || "None.";
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
	const originalityReviewSchema = z.object({
		needsRewrite: z.boolean(),
		reason: z.string(),
		rewrittenContent: z.string().default(""),
	});
	const originalityReviewPrompt = ChatPromptTemplate.fromMessages([
		[
			"system",
			`You are an internal editorial originality reviewer.
Assess whether the draft is too close to the source wording.
Rules:
- Prefer original paraphrasing across the entire article.
- Keep at most one short direct quote (<= 20 words) if absolutely necessary.
- Keep the article factual, with a neutral tone, and no markdown links.
- If rewrite is needed, return a full rewritten article body (300-500 words) that improves originality while preserving core facts.
- If rewrite is not needed, return rewrittenContent as an empty string.
`,
		],
		[
			"human",
			`Source content:
{sourceContent}

Draft article:
{draftContent}

Output must follow the structured schema.`,
		],
	]);
	const originalityReviewChain = originalityReviewPrompt.pipe(
		makeLlm(0.2).withStructuredOutput(originalityReviewSchema),
	);
	const topicProfiles = await loadRuntimeTopicProfiles();

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
			const topicProfile = findTopicProfile(topicProfiles, {
				slug: task.topic_slug,
				name: task.topic_name,
			});
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

			const [backgroundContext, editorNotes] = await Promise.all([
				fetchKbContext(task.topic_slug, cleanCandidateTitle),
				Promise.resolve(sanitizeEditorNotes(task.editor_notes, task.topic_name)),
			]);

			let result = await chain.invoke({
				topicName: task.topic_name,
				candidateTitle: cleanCandidateTitle,
				candidateUrl: task.candidate_url,
				candidateSnippet: task.candidate_snippet,
				editorNotes,
				backgroundContext,
				originalityFeedback:
					"Use original wording. Do not copy source sentences. If a direct quote is essential, use at most one short quote in double quotes.",
				sourceContent,
			});

			let originalityReview = await originalityReviewChain.invoke({
				sourceContent,
				draftContent: result.content,
			});
			let rewrittenContent = originalityReview.rewrittenContent ?? "";

			if (originalityReview.needsRewrite && rewrittenContent.trim().length > 0) {
				logger.warn(
					{ taskId: task.id, reason: compactText(originalityReview.reason, 180) },
					"writer: originality reviewer requested rewrite",
				);
				result = {
					...result,
					content: rewrittenContent.trim(),
				};

				originalityReview = await originalityReviewChain.invoke({
					sourceContent,
					draftContent: result.content,
				});
				rewrittenContent = originalityReview.rewrittenContent ?? "";
			}

			if (originalityReview.needsRewrite) {
				logger.warn(
					{
						taskId: task.id,
						reason: compactText(originalityReview.reason, 180),
					},
					"writer: originality reviewer still flagged overlap after rewrite attempt",
				);
			}

			const articleTitle = stripLeadingTopicLabel(result.title, task.topic_name);
			const slug = slugify(articleTitle);
			const url = `/articles/${formatToday()}/${slug}/`;
			const inserted = await insertGeneratedArticle(
				task.id,
				task.topic_id,
				articleTitle,
				result.content,
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
				`Published: ${compactText(articleTitle, 120)}. ${compactText(result.content, 140)}`,
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
