import pg from 'pg';
import { write } from './openai.js';
import { batch } from './utils.js';

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

export const pickArticlesToWrite = async (): Promise<
  { id: number; title: string; original: string }[]
> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query('SELECT * from info WHERE status = $1::varchar(32) LIMIT 10;', [
        'scraped',
      ])
      .then((result: { rows: any[] }) => {
        resolve(result.rows);
      });
  });

const items = await pickArticlesToWrite();

console.log(
  'articles to write:',
  items.map((item) => item.title),
);

await batch(items, 3, async (item) => {

  const { id, title, content } = await write(
    item.id,
    item.title,
    item.original.length > 1400
      ? item.original.substring(0, 1400)
      : item.original,
  );

  const article = JSON.stringify({
    title,
    article: content,
  });

  await dbClient.query(
    'UPDATE info SET status = $1::varchar(32), article = $2::text WHERE id = $3::int;',
    ['written', article, id],
  );
  console.log(`updated item ${id}...`);
});

console.log('done');

process.exit(0);
