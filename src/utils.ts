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

export const slugify = (text: string) => {
  return (
    text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "-") // Replace spaces with -
      .replace(/&/g, "-and-") // Replace & with 'and'
      // Replace # with 'sharp'
      .replace(/#/g, "-sharp-")
      // remove characters illegal in URLs
      .replace(/[^a-z0-9\-]/g, "")
      // remove :
      .replace(/:/g, "-")
      .substring(0, 150)
  );
};
