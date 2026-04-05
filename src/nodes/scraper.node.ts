import { scrapeUrl } from "../tools/scraper.tool.ts";
import {
	setArticleScraped,
	setArticleStatusByLink,
	getApprovedArticles,
	setArticleStatus,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { Article } from "../models.ts";
import type { PipelineState } from "../graph/state.ts";

const CONCURRENCY = 5;

const scrapeOne = async (article: Article): Promise<Article | null> => {
	if (article.original) {
		logger.debug({ link: article.link }, "scraper: already scraped, skipping fetch");
		await setArticleStatusByLink(article.link, "scraped");
		return article;
	}

	const result = await scrapeUrl(article.link);

	if (!result.ok) {
		logger.warn({ link: article.link, err: result.error }, "scraper: failed");
		await setArticleStatusByLink(article.link, "error-scraping");
		return null;
	}

	await setArticleScraped(article.link, result.content);
	return { ...article, original: result.content };
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

export const scraperNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	let articles = state.approvedArticles.length > 0
		? state.approvedArticles
		: await getApprovedArticles();

	if (state.plannedArticles.length > 0) {
		const selectedIds = new Set(
			state.plannedArticles.flatMap((plan) => plan.sourceArticleIds),
		);
		articles = articles.filter((article) => selectedIds.has(article.id));
	}

	logger.info({ count: articles.length }, "scraper: starting");

	const results = await runConcurrent(articles, CONCURRENCY, scrapeOne);

	const scraped = results.filter((a): a is Article => a !== null);

	if (scraped.length > 0) {
		await Promise.all(scraped.map((article) => setArticleStatus(article.id, "scraped")));
	}

	logger.info({ scraped: scraped.length }, "scraper: finished");

	return { scrapedArticles: scraped };
};
