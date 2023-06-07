import pg from 'pg';
import fs from 'fs';
import { marked } from 'marked';

const dbClient = new pg.Client({
  password: 'root',
  user: 'root',
  host: 'postgres',
});

export const pickArticlesToPublish = async (): Promise<
  { id: number; title: string; article: string }[]
> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query('SELECT * from info WHERE status = $1::varchar(32);', ['written'])
      .then((result: { rows: any[] }) => {
        resolve(result.rows);
      });
  });

console.log('picking articles to publish...');
const items = await pickArticlesToPublish();
console.log('picked articles to publish...');
if (items.length === 0) {
  console.log('no articles to publish');
  process.exit(0);
}

const operations = items.map(
  (raw) =>
    new Promise(async (done) => {
      const parsed = JSON.parse(raw.article);
      const item = {
        id: raw.id,
        title: parsed.title,
        article: parsed.article,
      };

      console.log('publising item', item.id);
      console.log('parsing...');
      const content = marked.parse(item.article);
      const html = `
<html>
  <head>
    <title>${item.title} </title>
  </head>
  <body>
  <article>
    <h1>${item.title}</h1>
    ${content}
    </article>
  </body>
</html>
  `;

      console.log(`publishing item ${item.id}...`);
      //write to a file synchronously
      fs.writeFileSync(`./public/${item.id}.html`, html);
      console.log(`published item ${item.id}...`);

      await dbClient.query(
        'UPDATE info SET status = $1::varchar(32) WHERE id = $2::int;',
        ['published', item.id],
      );

      done(null);
    }),
);

await Promise.all(operations);

console.log('published all items');

process.exit(0);
