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
