import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import {
	addTopicNote,
	completeArticleTask,
	getAllTopics,
	getRecentPublishedArticleTitles,
	getTopicIdsWithPendingPipeline,
	insertCreativeArticleTask,
	insertCreativeCandidate,
	insertGeneratedArticle,
	searchTopicNotes,
	setCandidateStatus,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { loadConfig } from "../config.ts";
import { normalizeArticleBody, slugify } from "../utils.ts";
import { extractJsonFromLlmText } from "../json-utils.ts";
import { findTopicProfile, loadRuntimeTopicProfiles } from "../topics/runtime.ts";
import { logDecision } from "../pipeline/decision-log.ts";
import type { GeneratedArticle } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";

const config = loadConfig();

// ── article idea generation ────────────────────────────────────────────────

const ideaOutputSchema = z.object({
	format: z
		.enum(["guide", "tips", "listicle", "deep-dive", "comparison", "cheatsheet"])
		.describe("The format of the creative article"),
	title: z.string().describe("A specific, compelling article title"),
	outline: z
		.union([z.string(), z.record(z.unknown()), z.array(z.unknown())])
		.transform((v) => typeof v === "string" ? v : JSON.stringify(v))
		.describe("A 2-3 sentence outline of what the article should cover"),
});

const ideaPrompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are a creative editorial planner for a developer-focused tech news website called Dev Radar.
Your job is to propose ONE practical, evergreen article idea for developers working with a given technology.

Pick a format:
- guide: A focused how-to on a specific technique or workflow
- tips: Practical tips developers can use immediately
- listicle: A curated list of tools, libraries, patterns, or resources
- deep-dive: An in-depth explanation of a specific concept or feature
- comparison: Comparing approaches, tools, or patterns
- cheatsheet: A condensed reference for a specific API, syntax, or workflow

Rules:
- The idea must be practical and useful for working developers (not beginners)
- Avoid generic topics like "Getting Started with X" or "Introduction to X"
- Focus on specific, actionable content (e.g., "5 lesser-known TypeScript compiler flags that catch real bugs")
- The title should be specific enough that a writer can produce it without further clarification
- Avoid topics that overlap with recent articles listed below
- Avoid title phrasing patterns that are too similar to recent titles

Respond with a JSON object containing: format, title, outline.`,
	],
	[
		"human",
		`Topic: {topicName} ({topicSlug})
Description: {topicDescription}
Editorial notes: {editorialNotes}

Recent articles and notes for this topic:
{recentContext}

Recent titles for this topic:
{recentTopicTitles}

Recent titles across all topics:
{recentGlobalTitles}

Propose one creative article idea.`,
	],
]);

// ── article writing ────────────────────────────────────────────────────────

const creativeWriterOutputSchema = z.object({
	title: z.string(),
	content: z.string(),
	categories: z.array(z.string()).default([]),
});

const creativeWriterPrompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are the creative writer agent for Dev Radar, a developer-focused tech news website.
Write a complete evergreen article in 400-700 words.

Format guidelines by type:
- guide: Step-by-step structure with clear sections
- tips: Numbered or bulleted tips, each with a brief explanation
- listicle: Numbered items with a short description of each
- deep-dive: Thorough explanation with examples and practical implications
- comparison: Side-by-side analysis with pros/cons or tradeoffs
- cheatsheet: Concise reference format, organized by category

General rules:
- Write for experienced developers, not beginners
- Include concrete examples, code patterns, or specific tool names where relevant
- When a code example improves clarity, include one fenced code block using triple backticks and a language tag (for example: \`\`\`ts)
- Keep code snippets short and practical (about 5-20 lines)
- Neutral, informative tone
- Short paragraphs separated by blank lines (3-5 sentences each)
- Do not include markdown links
- Do not invent version numbers or release dates
- End with a practical takeaway or next step
- Avoid title wording that is too similar to the recent title lists

Respond with a JSON object containing: title, content, categories.`,
	],
	[
		"human",
		`Topic: {topicName}
Article format: {format}
Title: {title}
Outline: {outline}

Background context:
{backgroundContext}

Recent titles for this topic:
{recentTopicTitles}

Recent titles across all topics:
{recentGlobalTitles}

Write the complete article.`,
	],
]);

// ── helpers ────────────────────────────────────────────────────────────────

const formatToday = () =>
	new Date().toISOString().split("T")[0].replace(/-/g, "/");

const getRecentContext = async (topicSlug: string): Promise<string> => {
	const notes = await searchTopicNotes(topicSlug, "published", 6);
	if (notes.length === 0) return "No recent articles.";

	return notes
		.map((n) => `- [${n.note_type}] ${n.content}`)
		.join("\n");
};

const formatRecentTitles = (titles: string[]): string => {
	if (titles.length === 0) return "No recent titles.";
	return titles.map((title) => `- ${title}`).join("\n");
};

const getCoveredTopicIds = (state: PipelineState): Set<number> => {
	const covered = new Set<number>();

	for (const article of state.publishedArticles) {
		covered.add(article.topic_id);
	}

	return covered;
};

// ── main node ──────────────────────────────────────────────────────────────

export const creativeWriterNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const startedAt = Date.now();
	const allTopics = await getAllTopics();
	const coveredTopicIds = getCoveredTopicIds(state);
	const pendingTopicIds = await getTopicIdsWithPendingPipeline();
	const topicProfiles = await loadRuntimeTopicProfiles();

	const uncoveredTopics = allTopics.filter(
		(t) => !coveredTopicIds.has(t.id) && !pendingTopicIds.has(t.id),
	);

	if (pendingTopicIds.size > 0) {
		logger.info(
			{ pendingTopicIds: [...pendingTopicIds] },
			`creative-writer: ${pendingTopicIds.size} topic(s) skipped — pending pipeline items`,
		);
	}

	if (uncoveredTopics.length === 0) {
		logger.info("creative-writer: all topics covered by hard news, skipping");
		return {};
	}

	logger.info(
		{
			totalTopics: allTopics.length,
			coveredTopics: coveredTopicIds.size,
			uncoveredTopics: uncoveredTopics.length,
			uncoveredSlugs: uncoveredTopics.map((t) => t.slug),
		},
		`creative-writer: ${uncoveredTopics.length} topic(s) need creative articles`,
	);

	const ideaLlm = makeLlm(0.7);
	const ideaChain = ideaPrompt.pipe(ideaLlm);
	const writerLlm = makeLlm(0.5);
	const writerChain = creativeWriterPrompt.pipe(writerLlm);

	const publishedArticles: GeneratedArticle[] = [
		...state.publishedArticles,
	];

	for (const topic of uncoveredTopics) {
		try {
			const profile = findTopicProfile(topicProfiles, {
				slug: topic.slug,
				name: topic.name,
			});

			const [recentContext, recentTopicTitlesRaw, recentGlobalTitlesRaw] = await Promise.all([
				getRecentContext(topic.slug),
				getRecentPublishedArticleTitles(8, topic.slug),
				getRecentPublishedArticleTitles(16),
			]);
			const recentTopicTitles = formatRecentTitles(recentTopicTitlesRaw);
			const recentGlobalTitles = formatRecentTitles(recentGlobalTitlesRaw);

			// 1. Generate an article idea
			const ideaRaw = await ideaChain.invoke({
				topicName: topic.name,
				topicSlug: topic.slug,
				topicDescription: profile?.description ?? topic.name,
				editorialNotes: profile?.editorialNotes ?? "",
				recentContext,
				recentTopicTitles,
				recentGlobalTitles,
			});
			const idea = ideaOutputSchema.parse(extractJsonFromLlmText(
				typeof ideaRaw.content === "string" ? ideaRaw.content : JSON.stringify(ideaRaw.content),
			));

			logger.info(
				{
					topic: topic.slug,
					format: idea.format,
					title: idea.title,
				},
				`creative-writer: idea generated for ${topic.slug}`,
			);

			logDecision(logger, "info", "creative-writer", "planned", {
				topic: topic.slug,
				title: idea.title,
				category: idea.format,
				reason: "no hard news articles in this run",
			});

			// 2. Write the article
			logger.info({ topic: topic.slug, title: idea.title }, `creative-writer: writing article for ${topic.slug}`);
			const writerRaw = await writerChain.invoke({
				topicName: topic.name,
				format: idea.format,
				title: idea.title,
				outline: idea.outline,
				backgroundContext: recentContext,
				recentTopicTitles,
				recentGlobalTitles,
			});
			const rawText = typeof writerRaw.content === "string" ? writerRaw.content : JSON.stringify(writerRaw.content);
			let result: z.infer<typeof creativeWriterOutputSchema>;
			try {
				result = creativeWriterOutputSchema.parse(extractJsonFromLlmText(rawText));
			} catch {
				// LLM returned plain text instead of JSON — wrap it
				logger.info({ topic: topic.slug }, `creative-writer: LLM returned plain text, wrapping as article body`);
				result = { title: idea.title, content: rawText, categories: [topic.name] };
			}

			const content = normalizeArticleBody(result.content);
			const articleTitle = result.title || idea.title;
			const slug = slugify(articleTitle);
			const url = `/articles/${formatToday()}/${slug}/`;

			// 3. Create synthetic candidate → task → article
			logger.info({ topic: topic.slug, articleTitle, slug, url }, `creative-writer: inserting candidate for ${topic.slug}`);
			const candidateId = await insertCreativeCandidate(
				topic.slug,
				articleTitle,
				idea.outline,
			);
			logger.info({ topic: topic.slug, candidateId }, `creative-writer: candidate inserted`);

			const taskId = await insertCreativeArticleTask(
				candidateId,
				`Creative article (${idea.format}): ${idea.outline}`,
			);
			logger.info({ topic: topic.slug, taskId }, `creative-writer: task inserted`);

			const inserted = await insertGeneratedArticle(
				taskId,
				topic.id,
				articleTitle,
				content,
				slug,
				url,
				config.GROQ_MODEL,
			);
			logger.info({ topic: topic.slug, articleId: inserted?.id ?? null }, `creative-writer: article row inserted`);

			await completeArticleTask(taskId, "completed");
			await setCandidateStatus(candidateId, "published");

			logger.info(
				{
					topic: topic.slug,
					title: articleTitle,
					format: idea.format,
					url,
				},
				`creative-writer: article published for ${topic.slug}`,
			);

			logDecision(logger, "info", "creative-writer", "written", {
				entity: "article",
				topic: topic.slug,
				category: idea.format,
				title: articleTitle,
				url,
				reason: "creative article to fill topic gap",
			});

			await addTopicNote(
				topic.slug,
				"summary",
				`Creative article: ${articleTitle}. Format: ${idea.format}.`,
				null,
				"creative-writer-agent",
			);

			if (inserted) {
				publishedArticles.push(inserted);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const errStack = err instanceof Error ? err.stack : undefined;
			logger.error(
				{ topic: topic.slug, error: errMsg, stack: errStack },
				`creative-writer: failed for ${topic.slug}: ${errMsg}`,
			);
			logDecision(logger, "error", "creative-writer", "failed", {
				topic: topic.slug,
				reason: `error: ${errMsg}`,
			}, { topic: topic.slug, error: errMsg, stack: errStack });
		}
	}

	const creativeCount = publishedArticles.length - state.publishedArticles.length;
	logger.info(
		{
			creativeArticles: creativeCount,
			totalPublished: publishedArticles.length,
			durationMs: Date.now() - startedAt,
		},
		`creative-writer: finished, ${creativeCount} creative article(s) generated`,
	);

	return {
		publishedArticles,
	};
};
