import { z } from "zod";
import { cheerio } from "../deps.ts";
import { makeLlm, systemUserPrompt } from "../llm.ts";
import { logger } from "../logger.ts";
import {
	markSourceSelectorIndexedNow,
	setSourceSelectorIndexSelectors,
	markSourceSelectorNeedsReindex,
	type IndexSelectors,
} from "../db/queries.ts";

// ── types ──────────────────────────────────────────────────────────────────

export type IndexCrawlItem = {
	title: string;
	url: string;
	date: Date | null;
	snippet: string;
};

export type LearnedSelectors = {
	selectors: IndexSelectors;
	items: IndexCrawlItem[];
};

// ── HTML helpers ───────────────────────────────────────────────────────────

const buildHtmlSkeleton = (html: string, maxLen = 7000): string => {
	const $ = cheerio.load(html);
	$("script, style, noscript, svg, link, meta").remove();

	// Strip all attributes except the ones useful for selector discovery
	$("*").each((_i, el) => {
		if (el.type !== "tag") return;
		const keep = ["class", "id", "href", "datetime", "type", "rel"];
		const attribs = el.attribs ?? {};
		for (const attr of Object.keys(attribs)) {
			if (!keep.includes(attr)) delete attribs[attr];
		}
	});

	const skeleton = $.html();
	return skeleton.length > maxLen
		? skeleton.substring(0, maxLen) + "\n... [truncated]"
		: skeleton;
};

const resolveUrl = (href: string, baseUrl: string): string => {
	try {
		return new URL(href, baseUrl).toString();
	} catch {
		return href;
	}
};

// ── LLM schema ─────────────────────────────────────────────────────────────

const selectorOutputSchema = z.object({
	pageType: z
		.enum(["index", "detail", "unknown"])
		.describe("Whether the page lists multiple items (index) or shows one item (detail)"),
	indexItemSelector: z
		.string()
		.describe("CSS selector that matches each article/post/release item container"),
	indexTitleSelector: z
		.string()
		.describe("CSS selector for the title, relative to each item container"),
	indexLinkSelector: z
		.string()
		.describe("CSS selector for the <a> link, relative to each item container"),
	indexDateSelector: z
		.string()
		.optional()
		.describe("CSS selector for the published date, relative to each item container"),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("Confidence in the selectors, 0-1"),
});

const selectorPrompt = systemUserPrompt(
	`You are a web scraping expert. Analyze HTML from a developer-focused page (blog, changelog, releases, docs)
and identify CSS selectors for extracting a list of articles or updates.

Rules:
- Prefer semantic elements (article, section, li, time) over brittle class names when possible
- indexItemSelector must match multiple sibling elements (the list items)
- indexTitleSelector and indexLinkSelector are relative to each item
- If this is NOT an index/list page, set pageType to "detail" or "unknown"
- Only set pageType "index" if you see at least 3 repeating item-like structures`,
	`URL: {url}

HTML:
{html}

Identify the CSS selectors for extracting the list of articles/items from this page.`,
);

// ── selector validation ─────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.5;
const MIN_VALID_ITEMS = 2;
const MIN_VALID_RATIO = 0.3;

const extractItems = (
	html: string,
	selectors: IndexSelectors,
	baseUrl: string,
): IndexCrawlItem[] => {
	const $ = cheerio.load(html);
	const items: IndexCrawlItem[] = [];

	$(selectors.indexItemSelector).each((_i, el) => {
		const $el = $(el);
		const title = $el.find(selectors.indexTitleSelector).first().text().trim();
		const rawHref =
			$el.find(selectors.indexLinkSelector).first().attr("href") ?? "";
		const url = rawHref ? resolveUrl(rawHref, baseUrl) : "";

		let date: Date | null = null;
		if (selectors.indexDateSelector) {
			const dateStr =
				$el.find(selectors.indexDateSelector).first().attr("datetime") ??
				$el.find(selectors.indexDateSelector).first().text().trim();
			if (dateStr) {
				const parsed = new Date(dateStr);
				if (!Number.isNaN(parsed.getTime())) date = parsed;
			}
		}

		const snippet = $el.text().replace(/\s+/g, " ").trim().substring(0, 280);

		items.push({ title, url, date, snippet });
	});

	return items;
};

const isValidItemList = (items: IndexCrawlItem[]): boolean => {
	if (items.length < MIN_VALID_ITEMS) return false;
	const validCount = items.filter((item) => item.title && item.url).length;
	return validCount / items.length >= MIN_VALID_RATIO;
};

// ── main export ────────────────────────────────────────────────────────────

export const learnAndCrawlSource = async (
	sourceUrl: string,
	_topicSlug: string,
	_topicName: string,
): Promise<LearnedSelectors | null> => {
	// Fetch the page
	let html: string;
	try {
		const res = await fetch(sourceUrl);
		if (!res.ok) {
			logger.warn(
				{ sourceUrl, status: res.status },
				`selector-learner ${sourceUrl}: fetch failed`,
			);
			return null;
		}
		html = await res.text();
	} catch (err) {
		logger.warn({ sourceUrl, err }, `selector-learner ${sourceUrl}: fetch error`);
		return null;
	}

	const skeleton = buildHtmlSkeleton(html);

	// Ask LLM for selectors
	let output: z.infer<typeof selectorOutputSchema>;
	try {
		const llm = makeLlm(0).withStructuredOutput(selectorOutputSchema);
		const chain = selectorPrompt.pipe(llm);
		output = await chain.invoke({ url: sourceUrl, html: skeleton });
	} catch (err) {
		logger.warn({ sourceUrl, err }, `selector-learner ${sourceUrl}: LLM call failed`);
		return null;
	}

	logger.info(
		{
			sourceUrl,
			pageType: output.pageType,
			confidence: output.confidence,
			itemSelector: output.indexItemSelector,
		},
		`selector-learner ${sourceUrl}: LLM response`,
	);

	if (output.pageType !== "index" || output.confidence < CONFIDENCE_THRESHOLD) {
		logger.info(
			{ sourceUrl, pageType: output.pageType, confidence: output.confidence },
			`selector-learner ${sourceUrl}: not an index page or low confidence, skipping`,
		);
		await markSourceSelectorNeedsReindex(sourceUrl);
		return null;
	}

	const selectors: IndexSelectors = {
		indexItemSelector: output.indexItemSelector,
		indexTitleSelector: output.indexTitleSelector,
		indexLinkSelector: output.indexLinkSelector,
		indexDateSelector: output.indexDateSelector ?? null,
	};

	// Validate selectors against the actual HTML
	const items = extractItems(html, selectors, sourceUrl);

	if (!isValidItemList(items)) {
		logger.warn(
			{ sourceUrl, itemCount: items.length },
			`selector-learner ${sourceUrl}: selectors produced no valid items, marking needs_reindex`,
		);
		await markSourceSelectorNeedsReindex(sourceUrl);
		return null;
	}

	// Persist the learned selectors
	await setSourceSelectorIndexSelectors(sourceUrl, selectors);

	logger.info(
		{
			sourceUrl,
			itemCount: items.length,
			selectors,
		},
		`selector-learner ${sourceUrl}: selectors learned and saved`,
	);

	return { selectors, items };
};

// ── cheerio crawl using stored selectors ───────────────────────────────────

export const crawlWithSelectors = async (
	sourceUrl: string,
	selectors: IndexSelectors,
): Promise<IndexCrawlItem[] | null> => {
	let html: string;
	try {
		const res = await fetch(sourceUrl);
		if (!res.ok) return null;
		html = await res.text();
	} catch (err) {
		logger.warn({ sourceUrl, err }, `selector-learner ${sourceUrl}: crawl fetch error`);
		return null;
	}

	const items = extractItems(html, selectors, sourceUrl);

	if (!isValidItemList(items)) {
		logger.warn(
			{ sourceUrl, itemCount: items.length },
			`selector-learner ${sourceUrl}: stored selectors returned no valid items, marking needs_reindex`,
		);
		await markSourceSelectorNeedsReindex(sourceUrl);
		return null;
	}

	await markSourceSelectorIndexedNow(sourceUrl);
	return items;
};
