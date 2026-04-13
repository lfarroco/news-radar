import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { cheerio } from "../deps.ts";
import { loadRuntimeTopicProfiles } from "../topics/runtime.ts";
import { learnAndCrawlSource } from "../nodes/selector-learner.node.ts";
import type { TopicProfile } from "../topics/types.ts";

export type ResearchSource = {
	title: string;
	url: string;
	content: string;
	score?: number;
};

const BLOCKED_HOST_PATTERN = /(reddit\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com)/i;
const DEFAULT_MAX_SOURCE_URLS = 3;
const runtimeProfilesCache: { value: TopicProfile[] | null } = { value: null };
const cheerioSourceCache = new Map<string, ResearchSource[]>();
const selectorSourceCache = new Map<string, ResearchSource[]>();

const toAbsoluteUrl = (href: string, baseUrl: string): string | null => {
	try {
		const parsed = new URL(href, baseUrl);
		if (!["http:", "https:"].includes(parsed.protocol)) return null;
		if (BLOCKED_HOST_PATTERN.test(parsed.hostname)) return null;
		return parsed.toString();
	} catch {
		return null;
	}
};

const compactText = (value: string, maxLen: number): string =>
	(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLen);

const normalizeForMatch = (value: string): string =>
	(value ?? "").toLowerCase().replace(/[^a-z0-9\s.-]/g, " ").replace(/\s+/g, " ").trim();

const extractUrlsFromQuery = (query: string): string[] => {
	const regex = /(https?:\/\/[^\s)\]}"']+)/g;
	const out = new Set<string>();
	for (const match of query.matchAll(regex)) {
		if (match[1]) out.add(match[1]);
	}
	return [...out];
};

const sourceLooksUseful = (title: string, content: string, query: string): boolean => {
	const normalizedQuery = normalizeForMatch(query);
	if (!normalizedQuery) return true;

	const queryTokens = normalizedQuery
		.split(" ")
		.filter((token) => token.length > 2)
		.slice(0, 8);

	if (queryTokens.length === 0) return true;

	const haystack = `${normalizeForMatch(title)} ${normalizeForMatch(content)}`;
	const matchCount = queryTokens.filter((token) => haystack.includes(token)).length;

	return matchCount >= Math.max(1, Math.floor(queryTokens.length / 4));
};

const parseWithCheerio = async (url: string): Promise<ResearchSource[]> => {
	const response = await fetch(url);
	if (!response.ok) return [];

	const html = await response.text();
	const $ = cheerio.load(html);

	const candidates: ResearchSource[] = [];

	$("article, main article, .post, .entry, li, section").slice(0, 20).each((_i, el) => {
		const container = $(el);
		const title = compactText(
			container.find("h1, h2, h3, a[rel='bookmark']").first().text() || container.find("a").first().text(),
			180,
		);
		const href = container.find("a").first().attr("href") ?? "";
		const absolute = toAbsoluteUrl(href, url);
		const content = compactText(container.text(), 320);

		if (!title || !absolute || !content) return;

		candidates.push({ title, url: absolute, content });
	});

	if (candidates.length > 0) return candidates;

	const pageTitle = compactText($("title, h1").first().text() || url, 180);
	const pageContent = compactText($("main, article, body").first().text(), 420);
	if (!pageContent) return [];

	return [{
		title: pageTitle || url,
		url,
		content: pageContent,
	}];
};

const getRuntimeTopicProfiles = async (): Promise<TopicProfile[]> => {
	if (runtimeProfilesCache.value) {
		return runtimeProfilesCache.value;
	}

	const profiles = await loadRuntimeTopicProfiles();
	runtimeProfilesCache.value = profiles;
	return profiles;
};

const parseWithSelectorLogic = async (
	url: string,
	topicSlug: string,
	topicName: string,
): Promise<ResearchSource[]> => {
	const learned = await learnAndCrawlSource(url, topicSlug, topicName);
	if (!learned) return [];

	return learned.items
		.filter((item) => !!item.title && !!item.url)
		.slice(0, 8)
		.map((item, idx) => ({
			title: compactText(item.title, 180),
			url: item.url,
			content: compactText(item.snippet, 320),
			score: Math.max(0.1, 1 - idx * 0.1),
		}));
};

const dedupeSources = (sources: ResearchSource[]): ResearchSource[] => {
	const seen = new Set<string>();
	const out: ResearchSource[] = [];

	for (const source of sources) {
		const key = source.url.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(source);
	}

	return out;
};

export const searchOnlineSources = async (
	query: string,
	maxResults = 5,
	options?: { profiles?: TopicProfile[] },
): Promise<ResearchSource[]> => {
	const profiles = options?.profiles ?? await getRuntimeTopicProfiles();
	const normalizedQuery = normalizeForMatch(query);

	const profile = profiles.find((entry) => {
		const byName = normalizedQuery.includes(normalizeForMatch(entry.name));
		const bySlug = normalizedQuery.includes(normalizeForMatch(entry.slug));
		const byQueries = (entry.researchQueries ?? []).some((term) =>
			normalizedQuery.includes(normalizeForMatch(term))
		);
		return byName || bySlug || byQueries;
	});

	const seedUrls = [
		...extractUrlsFromQuery(query),
		...((profile?.officialSources ?? []).map((source) => source.url)),
	].filter(Boolean).slice(0, DEFAULT_MAX_SOURCE_URLS);

	if (seedUrls.length === 0) return [];

	const topicSlug = profile?.slug ?? "general";
	const topicName = profile?.name ?? "General";

	const collected: ResearchSource[] = [];

	for (const seedUrl of seedUrls) {
		try {
			let cheerioResults = cheerioSourceCache.get(seedUrl);
			if (!cheerioResults) {
				cheerioResults = await parseWithCheerio(seedUrl);
				cheerioSourceCache.set(seedUrl, cheerioResults);
			}

			const usefulCheerioResults = cheerioResults.filter((source) =>
				sourceLooksUseful(source.title, source.content, query)
			);

			if (usefulCheerioResults.length > 0) {
				collected.push(...usefulCheerioResults);
				continue;
			}

			let selectorResults = selectorSourceCache.get(seedUrl);
			if (!selectorResults) {
				selectorResults = await parseWithSelectorLogic(seedUrl, topicSlug, topicName);
				selectorSourceCache.set(seedUrl, selectorResults);
			}

			const usefulSelectorResults = selectorResults.filter((source) =>
				sourceLooksUseful(source.title, source.content, query)
			);

			if (usefulSelectorResults.length > 0) {
				collected.push(...usefulSelectorResults);
			}
		} catch {
			// Continue with next source when a seed page fails.
		}
	}

	return dedupeSources(collected).slice(0, maxResults);
};

export const researchTopic = (
	topic: string,
	maxResults = 5,
): Promise<ResearchSource[]> => {
	const query = `${topic} release notes updates changelog developer tooling`;
	return searchOnlineSources(query, maxResults);
};

export const researchSourcesTool = new DynamicStructuredTool({
	name: "search_online_sources",
	description:
		"Browses configured official developer sources for a given topic or query and returns concise source snippets.",
	schema: z.object({
		query: z.string().min(2).describe("Search query or topic name"),
		maxResults: z.number().int().min(1).max(10).optional().default(5),
	}),
	func: async ({ query, maxResults }) => {
		const results = await searchOnlineSources(query, maxResults);
		if (!results.length) return "No online sources found.";
		return JSON.stringify(results, null, 2);
	},
});