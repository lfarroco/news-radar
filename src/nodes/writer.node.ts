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
import { compactText, slugify } from "../utils.ts";
import { scrapeUrl } from "../tools/scraper.tool.ts";
import type { GeneratedArticle } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";

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
- A short call to action at the end (for example: read release notes, patch now, or review migration steps)
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

Source content:
{sourceContent}`,
	],
]);

const formatToday = () => new Date().toISOString().split("T")[0].replace(/-/g, "/");

const summarizeNotes = (notes: string[]): string => {
	if (notes.length === 0) return "No knowledge base notes found.";
	return notes.slice(0, 6).map((note) => compactText(note, 180)).join("\n\n---\n\n");
};

export const writerNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const llm = makeLlm(0.3).withStructuredOutput(writerOutputSchema);
	const chain = prompt.pipe(llm);
	const publishedArticles: GeneratedArticle[] = [];

	for (let i = 0; i < MAX_TASKS_PER_RUN; i++) {
		const task = await claimNextPendingArticleTask();
		if (!task) break;

		try {
			const scraped = await scrapeUrl(task.candidate_url);
			const sourceContent = scraped.ok
				? scraped.content.slice(0, MAX_SOURCE_TEXT)
				: task.candidate_snippet;

			const kbNotes = await searchTopicNotes(task.topic_slug, task.candidate_title, 6);
			const knowledgeNotes = summarizeNotes(kbNotes.map((n) => n.content));

			const result = await chain.invoke({
				topicName: task.topic_name,
				candidateTitle: task.candidate_title,
				candidateUrl: task.candidate_url,
				candidateSnippet: task.candidate_snippet,
				editorNotes: task.editor_notes,
				knowledgeNotes,
				sourceContent,
			});

			const slug = slugify(result.title);
			const url = `/articles/${formatToday()}/${slug}/`;
			const inserted = await insertGeneratedArticle(
				task.id,
				task.topic_id,
				result.title,
				result.content,
				slug,
				url,
				config.GROQ_MODEL,
			);

			await completeArticleTask(task.id, "completed");
			await setCandidateStatus(task.candidate_id, "published");
			await addTopicNote(
				task.topic_slug,
				"summary",
				[
					`Published: ${result.title}`,
					`Angle: ${compactText(task.editor_notes, 160)}`,
					`Takeaway: ${compactText(result.content, 180)}`,
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

	logger.info({ written: publishedArticles.length }, "writer: finished");

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
