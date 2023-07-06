import { priority } from './openai.js';
import { dbClient } from './db.js';
import { Article } from './models.js';
import { batch } from './utils.js';

const BATCH_SIZE = 20;

export const filterCandidates = async (): Promise<Article[]> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query(`SELECT * from info WHERE status = 'pending';`)
      .then((result: { rows: any[] }) => {
        resolve(result.rows);
      });
  });

const items = await filterCandidates();

if (items.length === 0) {
  console.log('no items to filter');
  process.exit(0);
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

async function processBatch(batch: Article[]) {
  const titles = batch
    .map((item: any) => `(${item.id}) - ${item.title}`)
    .join('\n');


  console.log(`submitting
    ${titles}`);

  const parsed = await priority(titles);

  const approved = parsed.map(async (itemId) => {
    await dbClient.query(
      'UPDATE info SET status = $1::text WHERE id = $2::int;',
      ['approved', itemId],
    );

  });

  await Promise.all(approved);

  //reject the rest

  const rejected = batch.map(async (item) => {
    const found = parsed.find((id) => id === item.id);

    if (!found) {
      console.log(`rejecting item ${item.id}`);
      await dbClient.query(
        'UPDATE info SET status = $1::varchar(32) WHERE id = $2::int;',
        ['rejected', item.id],
      );
    }
  });

  await Promise.all(rejected);
}

const operations = batches.reduce(async (xs, x, index) => {
  console.log(`processing batch ${index}/${batches.length}...`);
  await xs;
  return processBatch(x);
}, Promise.resolve(null));

await operations;

process.exit(0);
