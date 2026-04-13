import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import {
	addTopicNote,
	getArticleReviewContext,
	getArticlesPendingReview,
	markArticleUnpublished,
	updateGeneratedArticle,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { slugify, stripLeadingTopicLabel, compactText, normalizeArticleBody } from "../utils.ts";
import type { PipelineState } from "../graph/state.ts";
import type { GeneratedArticle } from "../models.ts";
import { logDecision } from "../pipeline/decision-log.ts";

// ── JSON extraction helper ─────────────────────────────────────────────────

const sanitizeJsonStrings = (text: string): string =>
	text.replace(
		/"(?:[^"\\]|\\.)*"/g,
		(match) =>
			// deno-lint-ignore no-control-regex
			match.replace(/[\x00-\x1f]/g, (ch) => {
				if (ch === "\n") return "\\n";
				if (ch === "\r") return "\\r";
				if (ch === "\t") return "\\t";
				return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
			}),
	);

const extractJson = (text: string): unknown => {
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (fenceMatch) {
		try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through to sanitize */ }
		return JSON.parse(sanitizeJsonStrings(fenceMatch[1].trim()));
	}

	const braceMatch = text.match(/\{[\s\S]*\}/);
	if (braceMatch) {
		try { return JSON.parse(braceMatch[0]); } catch { /* fall through to sanitize */ }
		return JSON.parse(sanitizeJsonStrings(braceMatch[0]));
	}

	try { return JSON.parse(text); } catch { /* fall through to sanitize */ }
	return JSON.parse(sanitizeJsonStrings(text));
};

const reviewSchema = z.object({
	hasSufficientContent: z.boolean(),
	needsImprovement: z.boolean(),
	reviewSummary: z.string(),
	improvedTitle: z.string(),
	improvedContent: z.string(),
});

const reviewPrompt = ChatPromptTemplate.fromMessages([
	[
		"system",
		`You are the final article reviewer for a developer news website.
Review the draft article and decide if it should be improved before publishing.

Rules:
- The article must be useful and non-trivial for developers.
- Keep 300-500 words with short paragraphs separated by blank lines.
- Never copy source text verbatim; use original wording.
- You may add relevant context from editor notes and candidate snippet when it improves usefulness.
- Do not invent unverifiable facts.
- Keep tone neutral and practical.
- Do not include markdown links.

Respond with a JSON object containing these fields:
- hasSufficientContent (boolean)
- needsImprovement (boolean)
- reviewSummary (string)
- improvedTitle (string)
- improvedContent (string)

Output contract:
- Always return improvedTitle and improvedContent.
- If no improvements are needed, improvedTitle and improvedContent should still be valid and can match the original draft.
`,
	],
	[
		"human",
		`Topic: {topicName}
Candidate title: {candidateTitle}
Candidate URL: {candidateUrl}
Candidate snippet: {candidateSnippet}

Editor notes:
{editorNotes}

Current draft title:
{draftTitle}

Current draft content:
{draftContent}`,
	],
]);

const formatDatePath = (date: Date): string =>
	date.toISOString().split("T")[0].replace(/-/g, "/");

export const reviewerNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const startedAt = Date.now();
	const published = state.publishedArticles ?? [];

	// Pick up articles that failed review on a previous run
	const retries = await getArticlesPendingReview();
	const retryIds = new Set(retries.map((a) => a.id));
	const currentRunIds = new Set(published.map((a) => a.id));
	const retryArticles = retries.filter((a) => !currentRunIds.has(a.id));

	const allArticles: GeneratedArticle[] = [...published, ...retryArticles];

	if (retryArticles.length > 0) {
		logger.info(
			{ retryCount: retryArticles.length, retryIds: retryArticles.map((a) => a.id) },
			`reviewer: retrying ${retryArticles.length} article(s) from previous failed reviews`,
		);
	}

	if (allArticles.length === 0) {
		logger.info("reviewer: no published articles to review");
		return {};
	}

	const llm = makeLlm(0.2);
	const chain = reviewPrompt.pipe(llm);
	const reviewedArticles: GeneratedArticle[] = [];
	let improvedCount = 0;

	for (const article of allArticles) {
		try {
			const context = await getArticleReviewContext(article.id);
			if (!context) {
				logger.warn(
					{ articleId: article.id },
					"reviewer: skipped article due to missing review context",
				);
				logDecision(logger, "warn", "reviewer", "skipped", {
					entity: "article",
					article_id: article.id,
					title: compactText(article.title, 160),
					reason: "missing review context",
				});
				reviewedArticles.push(article);
				continue;
			}

			const raw = await chain.invoke({
				topicName: context.topic_name,
				candidateTitle: context.candidate_title,
				candidateUrl: context.candidate_url,
				candidateSnippet: context.candidate_snippet,
				editorNotes: context.editor_notes,
				draftTitle: article.title,
				draftContent: article.body,
			});
			const rawText = typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
			const review = reviewSchema.parse(extractJson(rawText));

			const nextTitle = stripLeadingTopicLabel(
				review.improvedTitle?.trim() || article.title,
				context.topic_name,
			);
			const nextBody = normalizeArticleBody(review.improvedContent?.trim() || article.body);
			const shouldUpdate =
				review.needsImprovement ||
				!review.hasSufficientContent ||
				nextTitle !== article.title ||
				nextBody !== article.body;

			if (!shouldUpdate) {
				// Re-publish retry articles that pass review without changes
				if (retryIds.has(article.id)) {
					await updateGeneratedArticle(article.id, article.title, article.body, article.slug, article.url);
				}
				logger.info(
					{ articleId: article.id, topic: context.topic_slug },
					"reviewer: kept article draft",
				);
				logDecision(logger, "info", "reviewer", "kept", {
					entity: "article",
					article_id: article.id,
					topic: context.topic_slug,
					title: compactText(article.title, 160),
					url: article.url,
					reason: "no improvements required",
				});
				reviewedArticles.push(article);
				continue;
			}

			const slug = slugify(nextTitle);
			const url = `/articles/${formatDatePath(article.published_at)}/${slug}/`;
			await updateGeneratedArticle(article.id, nextTitle, nextBody, slug, url);
			improvedCount++;

			await addTopicNote(
				context.topic_slug,
				"review",
				compactText(review.reviewSummary, 260),
				context.candidate_url,
				"reviewer-agent",
			);

			reviewedArticles.push({
				...article,
				title: nextTitle,
				body: nextBody,
				slug,
				url,
			});
			logger.info(
				{ articleId: article.id, topic: context.topic_slug },
				"reviewer: improved article draft",
			);
			logDecision(logger, "info", "reviewer", "improved", {
				entity: "article",
				article_id: article.id,
				topic: context.topic_slug,
				title: compactText(nextTitle, 160),
				url,
				reason: compactText(review.reviewSummary, 140),
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const errStack = err instanceof Error ? err.stack : undefined;
			logger.error(
				{ articleId: article.id, error: errMsg, stack: errStack },
				`reviewer: failed to review article ${article.id}: ${errMsg}`,
			);
			logDecision(logger, "error", "reviewer", "failed", {
				entity: "article",
				article_id: article.id,
				title: compactText(article.title, 160),
				url: article.url,
				reason: `error: ${errMsg}`,
			}, { articleId: article.id, error: errMsg, stack: errStack });

			// Mark unpublished so it gets retried on the next run
			try {
				await markArticleUnpublished(article.id);
				logger.info({ articleId: article.id }, "reviewer: marked article unpublished for retry");
			} catch (markErr) {
				logger.error({ articleId: article.id, error: String(markErr) }, "reviewer: failed to mark article unpublished");
			}
			// Don't include in reviewedArticles — it won't be published this run
		}
	}

	logger.info(
		{
			attempted: allArticles.length,
			fromCurrentRun: published.length,
			retried: retryArticles.length,
			improved: improvedCount,
			published: reviewedArticles.length,
			durationMs: Date.now() - startedAt,
		},
		"reviewer: finished",
	);

	return {
		publishedArticles: reviewedArticles,
	};
};
