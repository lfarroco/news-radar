import { z } from "zod";
import { cheerio } from "../deps.ts";
import { makeLlm, systemUserPrompt } from "../llm.ts";
import { logger } from "../logger.ts";
import {
	getAllSourceSelectors,
	deleteSourceSelector,
	deactivateTopicNoteBySourceUrl,
	clearSourceSelectorFeedUrl,
	markSourceSelectorNeedsReindex,
	setSourceSelectorIndexSelectors,
	markSourceSelectorIndexedNow,
	type SourceSelector,
	type IndexSelectors,
} from "../db/queries.ts";

// ── types ──────────────────────────────────────────────────────────────────

export type SourceHealthcheckOptions = {
	limit?: number;
	topicSlug?: string;
	dryRun?: boolean;
};

export type SourceHealthResult = {
	sourceUrl: string;
	topicSlug: string;
	status: "healthy" | "relearned" | "dead" | "feed_broken" | "selectors_broken" | "error";
	detail: string;
};

export type SourceHealthcheckSummary = {
	checked: number;
	healthy: number;
	relearned: number;
	dead: number;
	feedBroken: number;
	selectorsBroken: number;
	errors: number;
	results: SourceHealthResult[];
};

// ── HTTP health probe ──────────────────────────────────────────────────────

const DEAD_STATUS_CODES = new Set([404, 410, 451]);
const FETCH_TIMEOUT_MS = 15_000;

type FetchResult =
	| { ok: true; html: string; finalUrl: string }
	| { ok: false; reason: string };

const fetchSource = async (url: string): Promise<FetchResult> => {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		const res = await fetch(url, {
			signal: controller.signal,
			redirect: "follow",
			headers: { "User-Agent": "news-radar-healthcheck/1.0" },
		});
		clearTimeout(timer);

		if (DEAD_STATUS_CODES.has(res.status)) {
			await res.body?.cancel();
			return { ok: false, reason: `HTTP ${res.status}` };
		}
		if (!res.ok) {
			await res.body?.cancel();
			return { ok: false, reason: `HTTP ${res.status}` };
		}

		const html = await res.text();
		return { ok: true, html, finalUrl: res.url };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: msg };
	}
};

// ── feed probe ─────────────────────────────────────────────────────────────

const probeFeed = async (feedUrl: string): Promise<boolean> => {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		const res = await fetch(feedUrl, {
			signal: controller.signal,
			redirect: "follow",
			headers: { "User-Agent": "news-radar-healthcheck/1.0" },
		});
		clearTimeout(timer);

		if (!res.ok) {
			await res.body?.cancel();
			return false;
		}

		const text = await res.text();
		// A valid feed should contain XML-like content
		return text.includes("<rss") || text.includes("<feed") || text.includes("<channel");
	} catch {
		return false;
	}
};

// ── selector validation ────────────────────────────────────────────────────

const MIN_VALID_ITEMS = 2;
const MIN_VALID_RATIO = 0.3;

const validateStoredSelectors = (
	html: string,
	selectors: IndexSelectors,
): boolean => {
	const $ = cheerio.load(html);
	const items = $(selectors.indexItemSelector);

	if (items.length < MIN_VALID_ITEMS) return false;

	let validCount = 0;
	items.each((_i, el) => {
		const $el = $(el);
		const title = $el.find(selectors.indexTitleSelector).first().text().trim();
		const href = $el.find(selectors.indexLinkSelector).first().attr("href") ?? "";
		if (title && href) validCount++;
	});

	return validCount / items.length >= MIN_VALID_RATIO;
};

// ── LLM selector re-learning ──────────────────────────────────────────────

const buildHtmlSkeleton = (html: string, maxLen = 7000): string => {
	const $ = cheerio.load(html);
	$("script, style, noscript, svg, link, meta").remove();

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

const selectorOutputSchema = z.object({
	pageType: z
		.enum(["index", "detail", "unknown"])
		.describe("Whether the page lists multiple items or shows one item"),
	indexItemSelector: z
		.string()
		.describe("CSS selector matching each article/post/release item container"),
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

const CONFIDENCE_THRESHOLD = 0.5;

const relearnSelectors = async (
	sourceUrl: string,
	html: string,
): Promise<IndexSelectors | null> => {
	const skeleton = buildHtmlSkeleton(html);

	try {
		const llm = makeLlm(0).withStructuredOutput(selectorOutputSchema);
		const chain = selectorPrompt.pipe(llm);
		const output = await chain.invoke({ url: sourceUrl, html: skeleton });

		if (output.pageType !== "index" || output.confidence < CONFIDENCE_THRESHOLD) {
			logger.info(
				{ sourceUrl, pageType: output.pageType, confidence: output.confidence },
				`healthcheck: LLM says not an index page or low confidence`,
			);
			return null;
		}

		const selectors: IndexSelectors = {
			indexItemSelector: output.indexItemSelector,
			indexTitleSelector: output.indexTitleSelector,
			indexLinkSelector: output.indexLinkSelector,
			indexDateSelector: output.indexDateSelector ?? null,
		};

		// Validate the new selectors against the HTML
		if (!validateStoredSelectors(html, selectors)) {
			logger.warn(
				{ sourceUrl },
				`healthcheck: relearned selectors did not validate against current HTML`,
			);
			return null;
		}

		return selectors;
	} catch (err) {
		logger.warn({ sourceUrl, err }, `healthcheck: LLM relearn failed`);
		return null;
	}
};

// ── per-source check ───────────────────────────────────────────────────────

const hasStoredSelectors = (row: SourceSelector): boolean =>
	Boolean(row.index_item_selector && row.index_title_selector && row.index_link_selector);

const checkSource = async (
	row: SourceSelector,
	dryRun: boolean,
): Promise<SourceHealthResult> => {
	const { source_url: sourceUrl, topic_slug: topicSlug } = row;

	// 1. Fetch the page
	const fetchResult = await fetchSource(sourceUrl);

	if (!fetchResult.ok) {
		logger.warn(
			{ sourceUrl, reason: fetchResult.reason },
			`healthcheck: source unreachable`,
		);

		if (!dryRun) {
			await deactivateTopicNoteBySourceUrl(sourceUrl);
			await deleteSourceSelector(sourceUrl);
		}

		return {
			sourceUrl,
			topicSlug,
			status: "dead",
			detail: fetchResult.reason,
		};
	}

	const { html } = fetchResult;

	// 2. Check feed_url if present
	if (row.feed_url) {
		const feedAlive = await probeFeed(row.feed_url);
		if (!feedAlive) {
			logger.warn(
				{ sourceUrl, feedUrl: row.feed_url },
				`healthcheck: feed URL is broken`,
			);

			if (!dryRun) {
				await clearSourceSelectorFeedUrl(sourceUrl);
			}

			return {
				sourceUrl,
				topicSlug,
				status: "feed_broken",
				detail: `Feed ${row.feed_url} no longer resolves`,
			};
		}

		// Feed is fine — source is healthy
		if (!dryRun) await markSourceSelectorIndexedNow(sourceUrl);
		return {
			sourceUrl,
			topicSlug,
			status: "healthy",
			detail: "Feed URL is reachable",
		};
	}

	// 3. Validate stored CSS selectors
	if (hasStoredSelectors(row)) {
		const selectors: IndexSelectors = {
			indexItemSelector: row.index_item_selector!,
			indexTitleSelector: row.index_title_selector!,
			indexLinkSelector: row.index_link_selector!,
			indexDateSelector: row.index_date_selector ?? null,
		};

		if (validateStoredSelectors(html, selectors)) {
			if (!dryRun) await markSourceSelectorIndexedNow(sourceUrl);
			return {
				sourceUrl,
				topicSlug,
				status: "healthy",
				detail: "Stored selectors still valid",
			};
		}

		// Selectors are broken — try to re-learn
		logger.info(
			{ sourceUrl },
			`healthcheck: stored selectors broken, attempting re-learn via LLM`,
		);

		const newSelectors = await relearnSelectors(sourceUrl, html);
		if (newSelectors) {
			if (!dryRun) await setSourceSelectorIndexSelectors(sourceUrl, newSelectors);
			return {
				sourceUrl,
				topicSlug,
				status: "relearned",
				detail: "Selectors were broken, LLM relearned successfully",
			};
		}

		if (!dryRun) await markSourceSelectorNeedsReindex(sourceUrl);
		return {
			sourceUrl,
			topicSlug,
			status: "selectors_broken",
			detail: "Selectors broken and LLM relearn failed",
		};
	}

	// 4. Source has no feed and no selectors — try to learn from scratch
	const newSelectors = await relearnSelectors(sourceUrl, html);
	if (newSelectors) {
		if (!dryRun) await setSourceSelectorIndexSelectors(sourceUrl, newSelectors);
		return {
			sourceUrl,
			topicSlug,
			status: "relearned",
			detail: "No selectors existed, LLM learned new ones",
		};
	}

	if (!dryRun) await markSourceSelectorNeedsReindex(sourceUrl);
	return {
		sourceUrl,
		topicSlug,
		status: "selectors_broken",
		detail: "No selectors and LLM could not learn any",
	};
};

// ── main export ────────────────────────────────────────────────────────────

export const sourceHealthcheckNode = async (
	options: SourceHealthcheckOptions = {},
): Promise<SourceHealthcheckSummary> => {
	const limit = options.limit ?? 200;
	const topicSlug = options.topicSlug;
	const dryRun = options.dryRun ?? false;

	const sources = await getAllSourceSelectors(limit, topicSlug);

	if (sources.length === 0) {
		logger.info("healthcheck: no sources to check");
		return {
			checked: 0,
			healthy: 0,
			relearned: 0,
			dead: 0,
			feedBroken: 0,
			selectorsBroken: 0,
			errors: 0,
			results: [],
		};
	}

	logger.info(
		{ count: sources.length, topicSlug: topicSlug ?? "all", dryRun },
		`healthcheck: starting check of ${sources.length} sources`,
	);

	const results: SourceHealthResult[] = [];
	let healthy = 0;
	let relearned = 0;
	let dead = 0;
	let feedBroken = 0;
	let selectorsBroken = 0;
	let errors = 0;

	for (const [index, row] of sources.entries()) {
		logger.info(
			{ index: index + 1, total: sources.length, sourceUrl: row.source_url },
			`healthcheck: checking source ${index + 1}/${sources.length}`,
		);

		try {
			const result = await checkSource(row, dryRun);
			results.push(result);

			switch (result.status) {
				case "healthy":
					healthy++;
					break;
				case "relearned":
					relearned++;
					break;
				case "dead":
					dead++;
					break;
				case "feed_broken":
					feedBroken++;
					break;
				case "selectors_broken":
					selectorsBroken++;
					break;
			}
		} catch (err) {
			errors++;
			const msg = err instanceof Error ? err.message : String(err);
			logger.error(
				{ sourceUrl: row.source_url, err },
				`healthcheck: unexpected error checking source`,
			);
			results.push({
				sourceUrl: row.source_url,
				topicSlug: row.topic_slug,
				status: "error",
				detail: msg,
			});
		}
	}

	const summary: SourceHealthcheckSummary = {
		checked: sources.length,
		healthy,
		relearned,
		dead,
		feedBroken,
		selectorsBroken,
		errors,
		results,
	};

	logger.info(
		{
			checked: summary.checked,
			healthy: summary.healthy,
			relearned: summary.relearned,
			dead: summary.dead,
			feedBroken: summary.feedBroken,
			selectorsBroken: summary.selectorsBroken,
			errors: summary.errors,
		},
		`healthcheck: completed`,
	);

	return summary;
};
