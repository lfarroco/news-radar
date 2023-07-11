import { gpt } from './openai.ts';
import { dbClient } from './db.ts';
import { Article } from './models.ts';
import { batch } from './utils.ts';

const BATCH_SIZE = 20;

const prompt = async (items: string) => {
  const content = `
You are an editor for a magazine called "Dev Radar" that focuses on programming languages, frameworks and news related to them.
Our intention is to be a "radar" for developers to keep up with the latest news in the industry.
Our magazine publishes articles about the following subjects:
- programming languages
- updates to popular launguages, libraries or frameworks
- new libraries, frameworks and tools
- new features in programming languages
- algorithms and data structures

We don't select articles about the following subjects:
- company-specific news ("company x raises funding", "company y opens a new office")
- politics
- community drama
- programming in general (we talk about specific languages and frameworks)
- low-effort articles (e.g. "how to print hello world in X")
- how to get a job in the industry
- questions (e.g. "what is the best language for X?")
- small patch updates

You will be provided with a list of ids and article titles in the following format: 
(id) - title
Evaluate the ones that should be relevant for our readers based on their title.

Items that are not relevant should be excluded from the response.
The selected items should come as a JSON array with the selected articles' ids.
Don't reply in any format other than JSON, this is very important.
Articles that are not relevant for us should not be included in the response.
Example: 
Payload:
(33) - Rust 3.0 released
(34) - New features for Pandas
(35) - How to print hello world in Rust
Response: [33, 34]
If there are no articles that you want to publish, reply with an empty array: []
Take the necessary time to generate a JSON response with the articles that you want to publish.
Here's the list:
${items}
`;

  return gpt<number[]>(content, 0)

}


export const filterCandidates = async () => {
  await dbClient.connect();

  const { rows } = await dbClient
    .query(`SELECT * from info WHERE status = 'pending';`)

  return rows as Article[]
}

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


  console.log(`submitting\n${titles}`);

  const parsed = await prompt(titles)

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
