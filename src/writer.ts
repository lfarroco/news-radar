import pg from 'pg';
import { write } from './openai.js';
import { batch } from './utils.js';

const MAX_INPUT_TEXT_LENGTH = 3000;

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

export const pickArticlesToWrite = async (): Promise<
  { id: number; title: string; original: string }[]
> => {
  await dbClient.connect();

  const result = await dbClient.query(
    `SELECT * from info WHERE status = 'scraped';`,
  );
  return result.rows;
};

const items = await pickArticlesToWrite();

console.log(
  'articles to write:',
  items.map((item) => item.title),
);

await batch(items, 3, async (item) => {
  const { id, title, content } = await write(
    item.id,
    item.title,
    item.original.substring(0, MAX_INPUT_TEXT_LENGTH),
  );

  const article = JSON.stringify({
    title,
    article: content,
  });

  await dbClient.query(
    'UPDATE info SET status = $1::text, article = $2::text WHERE id = $3::int;',
    ['written', article, id],
  );
  console.log(`wrote article "${title}"...`);
});

console.log('done');

process.exit(0);
