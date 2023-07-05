import { priority } from './openai.ts';
import { dbClient } from './db.ts';
import { Article } from './models.ts';
import { batch } from './utils.ts';

const BATCH_SIZE = 20;

const filterCandidates = async (): Promise<Article[]> => {
  const response = await dbClient
    .from('info')
    .select('*')
    .eq('status', 'pending');

  return response.data;
};

async function processBatch(batch: Article[]) {
  const titles = batch
    .map((item: any) => `(${item.id}) - ${item.title}`)
    .join('\n');

  console.log(`submitting
    ${titles}`);

  const result = await priority(titles);

  const parsed: number[] = JSON.parse(result);

  const approved = parsed.map((itemId) =>
    dbClient.from('info').update({ status: 'approved' }).eq('id', itemId),
  );

  await Promise.all(approved);

  //reject the rest

  const rejected = batch.map(async (item) => {
    const found = parsed.find((p) => p === item.id);

    if (!found) {
      console.log(`rejecting item ${item.id}`);
      await dbClient
        .from('info')
        .update({ status: 'rejected' })
        .eq('id', item.id);
    }
  });

  await Promise.all(rejected);
}

export default async () => {
  const items = await filterCandidates();

  if (items.length === 0) {
    console.log('no items to filter');
    return;
  }
  const batches = items.reduce(
    (acc: Article[][], item: Article, index: number) => {
      const batchIndex = Math.floor(index / BATCH_SIZE);
      if (!acc[batchIndex]) {
        acc[batchIndex] = [];
      }
      acc[batchIndex].push(item);
      return acc;
    },
    [],
  );

  await batch(batches, 1, processBatch);

  const operations = batches.reduce(async (xs, x, index) => {
    console.log(`processing batch ${index}/${batches.length}...`);
    await xs;
    return processBatch(x);
  }, Promise.resolve(null));

  await operations;
};
