export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function batch<A>(
  items: A[],
  batchSize: number,
  fn: (a: A) => Promise<void>,
) {
  const batches = items.reduce(
    (acc: A[][], item: A, index: number) => {
      const batchIndex = Math.floor(index / batchSize);
      if (!acc[batchIndex]) {
        acc[batchIndex] = [];
      }
      acc[batchIndex].push(item);
      return acc;
    },
    [[]],
  );

  return batches.reduce(async (xs, x, index) => {
    await xs;
    console.log(`processing batch ${index+1}/${batches.length}...`);

    const operations = x.map(async (item) => {
      await fn(item);
    });

    await Promise.all(operations);
  }, Promise.resolve(null));
}

export const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/&/g, '-and-'); // Replace & with 'and'
};


