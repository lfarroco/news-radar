import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { makeLlm } from "../llm.ts";
import { setArticleStatus } from "../db/queries.ts";
import { logger } from "../logger.ts";
import { Article } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";

const MAX_RETRIES = 2;

const editorOutputSchema = z.object({
	verdict: z
		.enum(["approved", "needs_revision"])
		.describe("Whether the article is ready to publish or needs revision"),
	feedback: z
		.string()
		.describe("Brief feedback for the writer if revision is needed"),
});

const SYSTEM = `
You are the chief editor of "Dev Radar". Review the following article draft and decide if it is ready to publish.

Approve if:
- Written in third person
- Focused on the technical subject
- Under 250 words
- No external links included
- Accurate and neutral tone

Request revision if:
- Written in first person
- Contains marketing language or hype
- Significantly over 250 words
- Contains external links
- Factually suspect
`.trim();

const HUMAN = `Article title: {title}\n\nArticle content:\n{content}`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", SYSTEM],
	["human", HUMAN],
]);

export const editorNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	if (state.writtenArticles.length === 0) {
		return {};
	}

	if (state.writerRetries >= MAX_RETRIES) {
		logger.warn("editor: max retries reached, approving remaining drafts");
		return {};
	}

	logger.info({ count: state.writtenArticles.length }, "editor: reviewing articles");

	const llm = makeLlm(0).withStructuredOutput(editorOutputSchema);
	const chain = prompt.pipe(llm);

	const needsRevision: Article[] = [];
	const approved: Article[] = [];

	await Promise.all(
		state.writtenArticles.map(async (article) => {
			try {
				const result = await chain.invoke({
					title: article.article_title,
					content: article.article_content,
				});

				if (result.verdict === "approved") {
					approved.push(article);
				} else {
					logger.info(
						{ articleId: article.id, feedback: result.feedback },
						"editor: revision requested",
					);
					needsRevision.push(article);
					await setArticleStatus(article.id, "scraped"); // send back to writer queue
				}
			} catch (err) {
				logger.error({ err, articleId: article.id }, "editor: review failed, approving");
				approved.push(article);
			}
		}),
	);

	logger.info(
		{ approved: approved.length, needsRevision: needsRevision.length },
		"editor: finished",
	);

	return {
		writtenArticles: approved,
		scrapedArticles: needsRevision,
		writerRetries: needsRevision.length > 0
			? state.writerRetries + 1
			: state.writerRetries,
	};
};

export const editorRouter = (state: PipelineState): string => {
	if (state.scrapedArticles.length > 0 && state.writerRetries < MAX_RETRIES) {
		return "writer"; // loop back
	}
	return "publisher";
};
