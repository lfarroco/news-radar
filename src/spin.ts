import pg from 'pg';
import { spin } from './openai.js';

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

await dbClient.connect();

export const pickArticlesToSpin = async (): Promise<
  { id: number; title: string; article: string }[]
> => {

  const result = await dbClient.query(
    'SELECT * from info WHERE status = $1::text LIMIT 10;',
    ['spin'],
  );

  return result.rows;
};

const items = await pickArticlesToSpin();

console.log(
  'articles to spin:',
  items.map((item) => item.title),
);

const articles = items.map(async (article) => {
  const parsed = JSON.parse(article.article);
  const result = await spin(parsed.article);
  return { id: article.id, title: article.title, content: result };
});

const results = await Promise.all(articles);

const operations = results.map(
  ({ id, title, content }) =>
    new Promise(async (resolve) => {
      const article = JSON.stringify({
        title,
        article: content,
      });

      await dbClient.query(
        'UPDATE info SET status = $1::varchar(32), article = $2::text WHERE id = $3::int;',
        ['written', article, id],
      );
      console.log(`updated item ${id}...`);
      resolve(null);
    }),
);

await Promise.all(operations);

console.log('done');

process.exit(0);
