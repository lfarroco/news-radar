import { logger } from "../logger.ts";
import { cheerio } from "../deps.ts";
import { rssTool } from "../tools/rss.tool.ts";
import {
	getActiveScoutTopicSources,
	getPendingCandidates,
	markTopicCrawledNow,
} from "../db/queries.ts";
import type { PipelineState } from "../graph/state.ts";
import { sourceScoutNode } from "./source-scout.node.ts";

const FEED_CONTENT_TYPE_PATTERN = /(rss|atom|xml)/i;
const FEED_LINK_TYPE_PATTERN = /(rss|atom|xml)/i;

const isLikelyFeedUrl = (url: string): boolean =>
	/(\.xml|\.rss|\.atom|\/feed(\.xml)?|\/rss)$/i.test(url);

const toGithubReleaseFeedUrl = (url: string): string | null => {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "github.com") return null;
		const parts = parsed.pathname.split("/").filter(Boolean);
		if (parts.length < 3) return null;
		if (parts[2] !== "releases") return null;

		return `https://github.com/${parts[0]}/${parts[1]}/releases.atom`;
	} catch {
		return null;
	}
};

const findAlternateFeedUrl = (html: string, baseUrl: string): string | null => {
	const $ = cheerio.load(html);
	let match: string | null = null;

	$("link[rel~='alternate']").each((_idx, element) => {
		if (match) return;
		const href = $(element).attr("href");
		const type = $(element).attr("type") ?? "";
		if (!href || !FEED_LINK_TYPE_PATTERN.test(type)) return;

		try {
			match = new URL(href, baseUrl).toString();
		} catch {
			match = null;
		}
	});

	return match;
};

const resolveFeedUrl = async (sourceUrl: string): Promise<string | null> => {
	const githubReleaseFeed = toGithubReleaseFeedUrl(sourceUrl);
	if (githubReleaseFeed) return githubReleaseFeed;

	if (isLikelyFeedUrl(sourceUrl)) return sourceUrl;

	try {
		const response = await fetch(sourceUrl);
		const contentType = response.headers.get("content-type") ?? "";
		const body = await response.text();
		const responseUrl = response.url || sourceUrl;

		if (FEED_CONTENT_TYPE_PATTERN.test(contentType)) {
			return responseUrl;
		}

		if (body.trim().startsWith("<?xml") || body.includes("<rss") || body.includes("<feed")) {
			return responseUrl;
		}

		return findAlternateFeedUrl(body, responseUrl);
	} catch {
		return null;
	}
};

export const scannerNode = async (
	_state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const startedAt = Date.now();
	logger.info("scanner: starting");

	try {
		await sourceScoutNode();
	} catch (err) {
		logger.warn({ err }, "scanner: source scout failed, continuing with existing discovered sources");
	}

	const discoveredSources = await getActiveScoutTopicSources();
	if (discoveredSources.length === 0) {
		logger.warn("scanner: no scout-discovered sources found");
		return {
			pendingCandidates: [],
			metrics: {
				scanned: 0,
				reviewed: 0,
				tasksCreated: 0,
				written: 0,
			},
		};
	}

	const topicSources = new Map<string, { topicSlug: string; topicName: string; sourceUrls: Set<string> }>();
	for (const row of discoveredSources) {
		const key = row.topic_slug;
		const existing = topicSources.get(key);
		if (!existing) {
			topicSources.set(key, {
				topicSlug: row.topic_slug,
				topicName: row.topic_name,
				sourceUrls: new Set([row.source_url]),
			});
			continue;
		}

		existing.sourceUrls.add(row.source_url);
	}

	const tasks: Promise<string>[] = [];
	let rssTaskCount = 0;
	let unresolvedSourceCount = 0;

	for (const topic of topicSources.values()) {
		const resolvedFeedUrls = new Set<string>();
		for (const sourceUrl of topic.sourceUrls) {
			const feedUrl = await resolveFeedUrl(sourceUrl);
			if (!feedUrl) {
				unresolvedSourceCount++;
				logger.debug({ topic: topic.topicSlug, sourceUrl }, "scanner: source has no detectable feed");
				continue;
			}
			resolvedFeedUrls.add(feedUrl);
		}

		logger.info(
			{
				topic: topic.topicSlug,
				sourceUrls: topic.sourceUrls.size,
				resolvedFeeds: resolvedFeedUrls.size,
			},
			"scanner: scheduling topic sources",
		);

		for (const feedUrl of resolvedFeedUrls) {
			rssTaskCount++;
			tasks.push(
				rssTool.invoke({ url: feedUrl, topics: [topic.topicName], hasContent: true })
					.catch((err) => `rss error ${feedUrl}: ${err}`),
			);
		}

		await markTopicCrawledNow(topic.topicSlug);
	}

	logger.info(
		{
			topicCount: topicSources.size,
			rssTaskCount,
			unresolvedSourceCount,
			totalTasks: tasks.length,
		},
		"scanner: running source tasks",
	);

	const results = await Promise.allSettled(tasks);
	let fulfilled = 0;
	let rejected = 0;
	results.forEach((r) => {
		if (r.status === "rejected") {
			rejected++;
			logger.warn({ err: r.reason }, "scanner task failed");
		} else {
			fulfilled++;
			logger.debug(r.value);
		}
	});

	const pendingCandidates = await getPendingCandidates();
	logger.info(
		{
			count: pendingCandidates.length,
			fulfilled,
			rejected,
			durationMs: Date.now() - startedAt,
		},
		"scanner: finished",
	);

	return {
		pendingCandidates,
		metrics: {
			scanned: pendingCandidates.length,
			reviewed: 0,
			tasksCreated: 0,
			written: 0,
		},
	};
};
