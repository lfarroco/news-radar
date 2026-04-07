import type { TopicProfile } from "./topics/types.ts";

const normalizeSpaces = (text: string): string =>
	(text ?? "").replace(/\s+/g, " ").trim();

const normalizeForComparison = (text: string): string =>
	normalizeSpaces(text).toLowerCase();

const normalizePathPrefix = (pathname: string): string => {
	const normalized = (pathname || "/").replace(/\/+/g, "/").replace(/\/+$/g, "");
	return normalized || "/";
};

const parseUrlParts = (url: string): { hostname: string; pathPrefix: string } | null => {
	try {
		const parsed = new URL(url);
		return {
			hostname: parsed.hostname.toLowerCase(),
			pathPrefix: normalizePathPrefix(parsed.pathname.toLowerCase()),
		};
	} catch {
		return null;
	}
};

const isPathWithinPrefix = (pathname: string, prefix: string): boolean => {
	if (prefix === "/") return true;
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
};

export const isOfficialSourceUrl = (
	url: string,
	officialSourceUrls: string[],
): boolean => {
	const candidate = parseUrlParts(url);
	if (!candidate) return false;
	if (officialSourceUrls.length === 0) return false;

	return officialSourceUrls.some((officialUrl) => {
		const official = parseUrlParts(officialUrl);
		if (!official) return false;
		if (candidate.hostname !== official.hostname) return false;
		return isPathWithinPrefix(candidate.pathPrefix, official.pathPrefix);
	});
};

export const getOfficialSourceUrls = (profile: TopicProfile): string[] =>
	(profile.officialSources ?? [])
		.map((source) => source.url)
		.filter(Boolean);

export const isOfficialTopicSourceUrl = (
	profile: TopicProfile | null | undefined,
	url: string,
): boolean => {
	if (!profile) return false;
	return isOfficialSourceUrl(url, getOfficialSourceUrls(profile));
};

const splitSentences = (text: string): string[] =>
	normalizeSpaces(text)
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);

const isQuotedSentence = (sentence: string): boolean =>
	/^".*"$/.test(sentence) || /^“.*”$/.test(sentence);

const wordCount = (text: string): number =>
	normalizeSpaces(text).split(" ").filter(Boolean).length;

const escapeRegex = (input: string): string =>
	input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const findVerbatimSentenceMatches = (
	content: string,
	sourceContent: string,
	minWords = 12,
): string[] => {
	const normalizedSource = normalizeForComparison(sourceContent);
	if (!normalizedSource) return [];

	const matches: string[] = [];
	for (const sentence of splitSentences(content)) {
		if (isQuotedSentence(sentence)) continue;
		if (wordCount(sentence) < minWords) continue;

		const normalizedSentence = normalizeForComparison(sentence);
		if (!normalizedSentence) continue;

		if (normalizedSource.includes(normalizedSentence)) {
			matches.push(sentence);
		}
	}

	return [...new Set(matches)];
};

const quoteSentence = (content: string, sentence: string): string => {
	const escaped = escapeRegex(sentence);
	const pattern = new RegExp(`(^|\\s)${escaped}(?=$|\\s)`, "m");
	return content.replace(pattern, (_match, leadingSpace: string) => `${leadingSpace}"${sentence}"`);
};

export const enforceQuotesForCopiedText = (
	content: string,
	sourceContent: string,
): {
	content: string;
	copiedSentenceCount: number;
	quotedSentenceCount: number;
} => {
	const matches = findVerbatimSentenceMatches(content, sourceContent);
	if (matches.length === 0) {
		return {
			content,
			copiedSentenceCount: 0,
			quotedSentenceCount: 0,
		};
	}

	let quoted = content;
	let quotedCount = 0;
	for (const sentence of matches) {
		const next = quoteSentence(quoted, sentence);
		if (next !== quoted) {
			quotedCount++;
			quoted = next;
		}
	}

	return {
		content: quoted,
		copiedSentenceCount: matches.length,
		quotedSentenceCount: quotedCount,
	};
};