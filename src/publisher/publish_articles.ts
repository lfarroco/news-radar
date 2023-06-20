import fs from 'fs';
import { marked } from 'marked';
import { dbClient } from '../db.js';
import { Article } from '../models.js';
import { createArticleURL } from './createArticleURL.js';
import { template } from './template.js';

export const pickArticlesToPublish = async (): Promise<Article[]> => {
  await dbClient.connect();

  const result = await dbClient.query(
    `SELECT * from info WHERE status = 'written' OR status = 'published';`,
  );

  return result.rows;
};

console.log('picking articles to publish...');
const items = await pickArticlesToPublish();
console.log('picked articles to publish...');
if (items.length === 0) {
  console.log('no articles to publish');
  process.exit(0);
}

const operations = items.map(async (raw) => {
  const parsed = JSON.parse(raw.article);
  const item = {
    id: raw.id,
    link: raw.link,
    date: raw.date,
    title: parsed.title,
    article: parsed.article,
  };

  console.log('publising item', item.id);
  console.log('parsing...');
  const content = `
  <div class="card">
  <div class="card-body">
    <article>
        <h1>${item.title}</h1>
        <div class="disclaimer">
        This article was written by an AI 🤖. The original article can be found <a href="${
          item.link
        }">here</a>.
        </div>
        ${marked.parse(item.article)}
      </article>
    </div>
    </div>
  `;

  const html = template('../../../..', content);

  console.log(`publishing item ${item.id}...`);
  //write to a file synchronously
  const { publicDatePath, publicPath } = createArticleURL(item.id, item.date);

  // create directory if it doesn't exist
  //
  if (!fs.existsSync(publicDatePath)) {
    console.log(`creating directory ${publicDatePath}...`);
    fs.mkdirSync(publicDatePath, { recursive: true });
  }
  console.log(`writing file ${publicPath}...`);
  fs.writeFileSync(publicPath, html);
  console.log(`published item ${item.id}...`);

  await dbClient.query(
    'UPDATE info SET status = $1::varchar(32) WHERE id = $2::int;',
    ['published', item.id],
  );
  console.log(`updated item ${item.id}...`);
});

await Promise.all(operations);

console.log('published all items');

process.exit(0);
