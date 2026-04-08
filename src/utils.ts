import { slug } from "./deps.ts";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function batch<A>(
  items: A[],
  batchSize: number,
  fn: (a: A) => Promise<void>
) {
  const batches = items.reduce<A[][]>(
    (acc, item, index) => {
      const batchIndex = Math.floor(index / batchSize);
      if (!acc[batchIndex]) {
        acc[batchIndex] = [];
      }
      acc[batchIndex] = acc[batchIndex].concat([item]);
      return acc;
    },
    []
  );

  for (const [index, x] of batches.entries()) {
    console.log(`processing batch ${index + 1}/${batches.length}...`);

    const operations = x.map(async (item) => {
      await fn(item);
      return null;
    });

    await Promise.all(operations);
  }
}

export const group = <A>(items: A[], n: number): A[][] =>
  items.reduce<A[][]>((xs, x, index) => {
    const current = Math.floor(index / n);
    if (!xs[current]) {
      xs[current] = [];
    }
    xs[current].push(x);
    return xs;
  }, []);

const SLUG_ALIASES: Record<string, string> = {
  "C++": "cpp",
  "c++": "cpp",
  "C#": "csharp",
  "c#": "csharp",
  "F#": "fsharp",
  "f#": "fsharp",
}

export const slugify = (text: string) => {

  const hasAlias = Object.keys(SLUG_ALIASES).includes(text)

  if (hasAlias) {
    return SLUG_ALIASES[text]
  }

  return slug(text).substring(0, 150);
};

export const compactText = (text: string, maxLength: number): string => {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength + 1);
  const cutCandidates = [
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf(", "),
    clipped.lastIndexOf(" "),
  ];
  const bestCut = Math.max(...cutCandidates);
  const boundary = bestCut > Math.floor(maxLength * 0.6) ? bestCut : maxLength;

  return `${clipped.slice(0, boundary).trim()}...`;
};

const MARKDOWN_BLOCK_HINT = /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/m;

export const normalizeArticleBody = (body: string): string => {
  const normalized = (body ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  // Keep existing paragraph structure and markdown block formatting untouched.
  if (/\n\s*\n/.test(normalized) || MARKDOWN_BLOCK_HINT.test(normalized)) {
    return normalized;
  }

  const singleLine = normalized.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const sentenceMatches = singleLine.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [];
  const sentences = sentenceMatches.map((sentence) => sentence.trim()).filter(Boolean);

  // Very short content is left as-is to avoid awkward artificial paragraphing.
  if (sentences.length < 4) {
    return singleLine;
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }

  return paragraphs.join("\n\n");
};

const normalizeTopicLabel = (text: string): string =>
  (text ?? "")
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const stripLeadingTopicLabel = (
  title: string,
  topicName?: string,
): string => {
  const normalizedTitle = (title ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedTitle || !topicName) return normalizedTitle;

  const separator = " - ";
  const separatorIndex = normalizedTitle.indexOf(separator);
  if (separatorIndex === -1) return normalizedTitle;

  const prefix = normalizedTitle.slice(0, separatorIndex).trim();
  const rest = normalizedTitle.slice(separatorIndex + separator.length).trim();
  if (!prefix || !rest) return normalizedTitle;

  if (normalizeTopicLabel(prefix) !== normalizeTopicLabel(topicName)) {
    return normalizedTitle;
  }

  return rest;
};
