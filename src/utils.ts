import { slug } from "./deps.ts";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function batch<A>(
  items: A[],
  batchSize: number,
  fn: (a: A) => Promise<void>
) {
  const batches = items.reduce(
    (acc: A[][], item: A, index: number) => {
      const batchIndex = Math.floor(index / batchSize);
      if (!acc[batchIndex]) {
        acc[batchIndex] = [];
      }
      acc[batchIndex] = acc[batchIndex].concat([item]);
      return acc;
    },
    [[]]
  );

  return batches.reduce(async (xs, x, index) => {
    await xs;
    console.log(`processing batch ${index + 1}/${batches.length}...`);

    const operations = x.map(async (item) => {
      await fn(item);
      return null;
    });

    await Promise.all(operations);
  }, Promise.resolve(null));
}

export const group = <A>(items: A[], n: number): A[][] =>
  items.reduce((xs, x, index) => {
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
