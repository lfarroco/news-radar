import { logger } from "../logger.ts";
import { cheerio } from "../deps.ts";
import { rssTool } from "../tools/rss.tool.ts";
import { isOfficialSourceUrl } from "../editorial-policy.ts";
import { findTopicProfile, loadRuntimeTopicProfiles } from "../topics/runtime.ts";
import {
	getActiveScoutTopicSources,
	getSourceSelectorCoverageStats,
	getSourceSelectorsByTopicSlug,
	getPendingCandidates,
	markTopicCrawledNow,
	setSourceSelectorFeedUrl,
	touchSourceSelector,
	insertCandidate,
	upsertTopic,
} from "../db/queries.ts";
import type { PipelineState } from "../graph/state.ts";
import { sourceScoutNode } from "./source-scout.node.ts";
import { learnAndCrawlSource, crawlWithSelectors } from "./selector-learner.node.ts";

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

	const topicProfiles = await loadRuntimeTopicProfiles();

	const topicSources = new Map<string, { topicSlug: string; topicName: string; sourceUrls: Set<string> }>();
	let skippedNonOfficialSources = 0;
	for (const row of discoveredSources) {
		const matchedProfile = findTopicProfile(topicProfiles, {
			slug: row.topic_slug,
			name: row.topic_name,
		});
		const officialSourceUrls = (matchedProfile?.officialSources ?? [])
			.map((source) => source.url)
			.filter(Boolean);
		if (!isOfficialSourceUrl(row.source_url, officialSourceUrls)) {
			skippedNonOfficialSources++;
			logger.debug(
				{ topic: row.topic_slug, sourceUrl: row.source_url },
				"scanner: skipping discovered source outside official allowlist",
			);
			continue;
		}

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
	let selectorCrawlCount = 0;
	let selectorLearnCount = 0;
	let unresolvedSourceCount = 0;

	for (const topic of topicSources.values()) {
		// Load any previously-learned selectors for this topic's sources
		const knownSelectors = new Map(
			(await getSourceSelectorsByTopicSlug(topic.topicSlug)).map((s) => [s.source_url, s]),
		);

		const resolvedFeedUrls = new Set<string>();

		for (const sourceUrl of topic.sourceUrls) {
			const stored = knownSelectors.get(sourceUrl);

			// 1. Source has working index selectors → crawl with cheerio, no external calls
			if (
				stored &&
				!stored.needs_reindex &&
				stored.index_item_selector &&
				stored.index_title_selector &&
				stored.index_link_selector
			) {
				selectorCrawlCount++;
				logger.debug(
					{ topic: topic.topicSlug, sourceUrl },
					"scanner: using stored index selectors",
				);
				tasks.push(
					crawlWithSelectors(sourceUrl, {
						indexItemSelector: stored.index_item_selector,
						indexTitleSelector: stored.index_title_selector,
						indexLinkSelector: stored.index_link_selector,
						indexDateSelector: stored.index_date_selector ?? null,
					}).then(async (items) => {
						if (!items) return `selector crawl returned nothing for ${sourceUrl}`;
						const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;
						await upsertTopic(topic.topicName, topic.topicSlug);
						let inserted = 0;
						for (const item of items) {
							if (!item.title || !item.url) continue;
							const age = item.date ? Date.now() - item.date.getTime() : 0;
							if (item.date && age > MAX_AGE_MS) continue;
							await insertCandidate(
								item.title,
								item.url,
								item.snippet,
								sourceUrl,
								item.date ?? new Date(),
								topic.topicSlug,
								topic.topicName,
							);
							inserted++;
						}
						return `selector crawl ${sourceUrl}: ${inserted} candidates`;
					}).catch((err) => `selector crawl error ${sourceUrl}: ${err}`),
				);
				continue;
			}

			// 2. Feed URL is cached → use RSS directly, skip HTTP probe
			if (stored?.feed_url && !stored.needs_reindex) {
				rssTaskCount++;
				resolvedFeedUrls.add(stored.feed_url);
				continue;
			}

			// 3. No cached info → probe for a feed
			await touchSourceSelector(sourceUrl, topic.topicSlug, stored?.source_type ?? "unknown");
			const feedUrl = await resolveFeedUrl(sourceUrl);

			if (feedUrl) {
				rssTaskCount++;
				resolvedFeedUrls.add(feedUrl);
				// Cache the resolved feed URL so future runs skip the probe
				await setSourceSelectorFeedUrl(sourceUrl, feedUrl);
				continue;
			}

			// 4. No feed found → run selector learner (1 cheerio fetch + 1 LLM call)
			selectorLearnCount++;
			logger.info(
				{ topic: topic.topicSlug, sourceUrl },
				"scanner: no feed found, running selector learner",
			);
			tasks.push(
				learnAndCrawlSource(sourceUrl, topic.topicSlug, topic.topicName).then(
					async (result) => {
						if (!result) {
							unresolvedSourceCount++;
							return `selector-learner found nothing for ${sourceUrl}`;
						}
						const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;
						await upsertTopic(topic.topicName, topic.topicSlug);
						let inserted = 0;
						for (const item of result.items) {
							if (!item.title || !item.url) continue;
							const age = item.date ? Date.now() - item.date.getTime() : 0;
							if (item.date && age > MAX_AGE_MS) continue;
							await insertCandidate(
								item.title,
								item.url,
								item.snippet,
								sourceUrl,
								item.date ?? new Date(),
								topic.topicSlug,
								topic.topicName,
							);
							inserted++;
						}
						return `selector-learner ${sourceUrl}: learned selectors, ${inserted} candidates`;
					},
				).catch((err) => `selector-learner error ${sourceUrl}: ${err}`),
			);
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
			tasks.push(
				rssTool.invoke({ url: feedUrl, topics: [topic.topicName], hasContent: true })
					.catch((err) => `rss error ${feedUrl}: ${err}`),
			);
		}

		await markTopicCrawledNow(topic.topicSlug);
	}

	const selectorCoverage = await getSourceSelectorCoverageStats();

	logger.info(
		{
			discoveredSources: discoveredSources.length,
			skippedNonOfficialSources,
			topicCount: topicSources.size,
			rssTaskCount,
			selectorCrawlCount,
			selectorLearnCount,
			unresolvedSourceCount,
			selectorCoverage,
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
