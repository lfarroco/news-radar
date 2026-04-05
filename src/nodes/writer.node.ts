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
import type { PipelineState } from "../graph/state.ts";
import {
	searchOnlineSources,
	type ResearchSource,
} from "../tools/tavily.tool.ts";

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

Additional online context (sources + snippets):
{researchContext}
`;

const prompt = ChatPromptTemplate.fromMessages([
	["system", SYSTEM],
	["human", HUMAN],
]);

const parseTopicsField = (raw: string | undefined): string[] => {
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed
				.filter((v): v is string => typeof v === "string")
				.map((v) => v.trim())
				.filter(Boolean);
		}
	} catch {
		// Ignore malformed topics JSON.
	}

	return [];
};

const parseTopicsFromTitle = (title: string): string[] => {
	const [prefix] = title.split(" - ", 1);
	if (!prefix || !title.includes(" - ")) return [];

	return prefix
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
};

const dedupeSources = (sources: ResearchSource[]): ResearchSource[] => {
	const seen = new Set<string>();
	const out: ResearchSource[] = [];
	for (const source of sources) {
		if (!source.url || seen.has(source.url)) continue;
		seen.add(source.url);
		out.push(source);
	}
	return out;
};

const buildResearchContext = (
	sources: ResearchSource[],
): string => {
	if (sources.length === 0) return "No additional sources found.";

	return sources
		.slice(0, 6)
		.map((source, idx) => {
			const snippet = source.content.substring(0, 240);
			return [
				`Source ${idx + 1}: ${source.title}`,
				`URL: ${source.url}`,
				`Snippet: ${snippet}`,
			].join("\n");
		})
		.join("\n\n");
};

const collectResearchForArticle = async (
	article: Article,
	topicResearch: Record<string, ResearchSource[]>,
): Promise<ResearchSource[]> => {
	const topics = new Set<string>();

	for (const topic of parseTopicsField(article.topics)) topics.add(topic.toLowerCase());
	for (const topic of parseTopicsFromTitle(article.title)) topics.add(topic.toLowerCase());

	const fromTopics: ResearchSource[] = [];
	for (const topic of topics) {
		const sources = topicResearch[topic] ?? [];
		fromTopics.push(...sources);
	}

	let sources = dedupeSources(fromTopics);

	if (sources.length < 2 && config.TAVILY_API_KEY) {
		try {
			const query = `${article.title} release notes changelog technical details`;
			const fallback = await searchOnlineSources(query, 3);
			sources = dedupeSources([...sources, ...fallback]);
		} catch (err) {
			logger.warn(
				{ err, articleId: article.id },
				"writer: online fallback lookup failed",
			);
		}
	}

	return sources;
};

const writeOne = async (
	article: Article,
	topicResearch: Record<string, ResearchSource[]>,
): Promise<Article | null> => {
	const llm = makeLlm(0.4).withStructuredOutput(articleOutputSchema);
	const chain = prompt.pipe(llm);

	try {
		const researchSources = await collectResearchForArticle(article, topicResearch);
		const researchContext = buildResearchContext(researchSources);

		const result = await chain.invoke({
			title: article.title,
			content: article.original.substring(0, MAX_INPUT_LENGTH),
			researchContext,
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
			config.GROQ_MODEL,
		);

		await Promise.all(
			result.categories.map(async (cat: string) => {
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

	const topicResearch = state.topicResearch ?? {};

	const results = await runConcurrent(articles, 3, (article) =>
		writeOne(article, topicResearch)
	);
	const written = results.filter((a): a is Article => a !== null);

	logger.info({ written: written.length }, "writer: finished");
	return { writtenArticles: written };
};
