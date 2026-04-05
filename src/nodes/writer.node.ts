import { ChatPromptTemplate } from "@langchain/core/prompts";
import { makeLlm, articleOutputSchema } from "../llm.ts";
import {
	publishArticle,
	linkArticleTopicById,
	upsertTopic,
	getScrapedArticles,
} from "../db/queries.ts";
import { slugify } from "../utils.ts";
import { logger } from "../logger.ts";
import { loadConfig } from "../config.ts";
const config = loadConfig();
import { Article } from "../models.ts";
import type { PipelineState } from "./state.ts";

const MAX_INPUT_LENGTH = 3000;

const SYSTEM = `
You are an editor for "Dev Radar", a magazine covering programming languages, frameworks, and developer tooling.
Write in third person ("the article shows...", "the author argues...").
Highlight information relevant to developers who want to stay current.
Escape any HTML elements with backticks.
Do not include links.
Keep the article up to 200 words; you may exceed this only when necessary.
`.trim();

const HUMAN = `
Reference article title: {title}

Reference article content:
{content}
`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", SYSTEM],
	["human", HUMAN],
]);

const writeOne = async (article: Article): Promise<Article | null> => {
	const llm = makeLlm(0.4).withStructuredOutput(articleOutputSchema);
	const chain = prompt.pipe(llm);

	try {
		const result = await chain.invoke({
			title: article.title,
			content: article.original.substring(0, MAX_INPUT_LENGTH),
		});

		const formattedDate = article.date
			.toISOString()
			.split("T")[0]
			.replace(/-/g, "/");
		const slug = slugify(result.title);
		const url = `/articles/${formattedDate}/${slug}/`;

		await publishArticle(
			article.id,
			result.title,
			result.content,
			slug,
			url,
			config.OPENAI_MODEL,
		);

		await Promise.all(
			result.categories.map(async (cat) => {
				await upsertTopic(cat, slugify(cat));
				await linkArticleTopicById(article.id, slugify(cat));
			}),
		);

		logger.info({ title: result.title }, "writer: published article");
		return { ...article, article_title: result.title, article_content: result.content };
	} catch (err) {
		logger.error({ err, articleId: article.id }, "writer: failed");
		return null;
	}
};

const runConcurrent = async <T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> => {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		const slice = items.slice(i, i + concurrency);
		const batch = await Promise.all(slice.map(fn));
		results.push(...batch);
	}
	return results;
};

export const writerNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const articles = state.scrapedArticles.length > 0
		? state.scrapedArticles
		: await getScrapedArticles();

	logger.info({ count: articles.length }, "writer: starting");

	const results = await runConcurrent(articles, 3, writeOne);
	const written = results.filter((a): a is Article => a !== null);

	logger.info({ written: written.length }, "writer: finished");
	return { writtenArticles: written };
};
