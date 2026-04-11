import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import {
	addTopicNote,
	getArticleReviewContext,
	updateGeneratedArticle,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { slugify, stripLeadingTopicLabel, compactText, normalizeArticleBody } from "../utils.ts";
import type { PipelineState } from "../graph/state.ts";
import type { GeneratedArticle } from "../models.ts";
import { logDecision } from "../pipeline/decision-log.ts";

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
	if (published.length === 0) {
		logger.info("reviewer: no published articles to review");
		return {};
	}

	const llm = makeLlm(0.2).withStructuredOutput(reviewSchema);
	const chain = reviewPrompt.pipe(llm);
	const reviewedArticles: GeneratedArticle[] = [];
	let improvedCount = 0;

	for (const article of published) {
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

			const review = await chain.invoke({
				topicName: context.topic_name,
				candidateTitle: context.candidate_title,
				candidateUrl: context.candidate_url,
				candidateSnippet: context.candidate_snippet,
				editorNotes: context.editor_notes,
				draftTitle: article.title,
				draftContent: article.body,
			});

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
			logger.error(
				{ err, articleId: article.id },
				"reviewer: failed to review article",
			);
			logDecision(logger, "error", "reviewer", "failed", {
				entity: "article",
				article_id: article.id,
				title: compactText(article.title, 160),
				url: article.url,
				reason: "unexpected error during review",
			}, { err, articleId: article.id });
			reviewedArticles.push(article);
		}
	}

	logger.info(
		{
			attempted: published.length,
			improved: improvedCount,
			durationMs: Date.now() - startedAt,
		},
		"reviewer: finished",
	);

	return {
		publishedArticles: reviewedArticles,
	};
};
