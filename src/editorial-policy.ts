const PERSONAL_BLOG_HOST_PATTERNS = [
	"medium.com",
	"substack.com",
	"dev.to",
	"hashnode.dev",
	"ghost.io",
	"blogspot.",
	"wordpress.com",
	"bearblog.dev",
	"write.as",
];

const PERSONAL_BLOG_PATH_PATTERNS = [
	/\/\@[a-z0-9_.-]+\/?$/i,
	/\/~[a-z0-9_.-]+\/?$/i,
	/\/users?\/[a-z0-9_.-]+\/?$/i,
	/\/u\/[a-z0-9_.-]+\/?$/i,
];

const PERSONAL_BLOG_TEXT_PATTERNS = [
	/\bmy\s+blog\b/i,
	/\bpersonal\s+blog\b/i,
	/\bmy\s+notes\b/i,
	/\bopinion\b/i,
	/\bthoughts\b/i,
];

const normalizeSpaces = (text: string): string =>
	(text ?? "").replace(/\s+/g, " ").trim();

const normalizeForComparison = (text: string): string =>
	normalizeSpaces(text).toLowerCase();

const safeHostname = (url: string): string => {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return "";
	}
};

const safePathname = (url: string): string => {
	try {
		return new URL(url).pathname.toLowerCase();
	} catch {
		return "";
	}
};

const isPersonalBlogHost = (hostname: string): boolean => {
	if (!hostname) return false;
	return PERSONAL_BLOG_HOST_PATTERNS.some((pattern) =>
		hostname === pattern || hostname.endsWith(`.${pattern}`) || hostname.includes(pattern)
	);
};

const isPersonalBlogPath = (pathname: string): boolean =>
	PERSONAL_BLOG_PATH_PATTERNS.some((pattern) => pattern.test(pathname));

const hasPersonalBlogTextSignal = (text: string): boolean =>
	PERSONAL_BLOG_TEXT_PATTERNS.some((pattern) => pattern.test(text));

export const isLikelyPersonalBlogCandidate = (candidate: {
	url: string;
	title: string;
	snippet?: string;
	source?: string;
}): boolean => {
	const hostname = safeHostname(candidate.url);
	const pathname = safePathname(candidate.url);
	const text = `${candidate.title}\n${candidate.snippet ?? ""}\n${candidate.source ?? ""}`;

	if (isPersonalBlogHost(hostname)) return true;
	if (isPersonalBlogPath(pathname)) return true;
	if (hasPersonalBlogTextSignal(text)) return true;

	return false;
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