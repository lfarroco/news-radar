import { priority } from './openai.js';
import { dbClient } from './db.js';
import { Article } from './models.js';

const BATCH_SIZE = 20;

export const filterCandidates = async (): Promise<Article[]> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query('SELECT * from info WHERE status = $1::varchar(32);', ['pending'])
      .then((result: { rows: any[] }) => {
        resolve(result.rows);
      });
  });

const items = await filterCandidates();

if (items.length === 0) {
  console.log('no items to filter');
  process.exit(0);
}

// process in batches

const batches = items.reduce(
  (acc: Article[][], item: Article, index: number) => {
    const batchIndex = Math.floor(index / BATCH_SIZE);
    if (!acc[batchIndex]) {
      acc[batchIndex] = [];
    }
    acc[batchIndex].push(item);
    return acc;
  },
  [[]],
);

async function processBatch(batch: Article[]) {
  const titles = batch
    .map((item: any) => `(${item.id}) - ${item.title}`)
    .join('\n');

  const result = await priority(titles);

  const parsed: { id: number; topics: string[] }[] = JSON.parse(result);

  const approved = parsed.map(async (item) => {
    const topics = JSON.stringify(item.topics);
    console.log(`updating item ${item.id} with topics ${topics}`);
    await dbClient.query(
      'UPDATE info SET status = $1::varchar(32) WHERE id = $2::int;',
      ['approved', item.id],
    );

    const createTopics = item.topics.map(
      async (topic) =>
        await dbClient.query(
          `INSERT INTO topics (name) 
           VALUES ($1::varchar(128))
           ON CONFLICT (name) DO NOTHING
          ;`,
          [topic],
        ),
    );

    await Promise.all(createTopics);

    const createTopicRelations = item.topics.map(
      async (topic) =>
        await dbClient.query(
          'INSERT INTO article_topic (article_id, topic_id) VALUES ($1::int, (SELECT id FROM topics WHERE name = $2::varchar(128)));',
          [item.id, topic],
        ),
    );

    await Promise.all(createTopicRelations);
  });

  await Promise.all(approved);

  //reject the rest

  const rejected = batch.map(async (item) => {
    const found = parsed.find((p) => p.id === item.id);

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
