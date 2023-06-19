import fs from 'fs';
import { dbClient } from '../db.js';
import { Article } from '../models.js';
import { createArticleURL } from './createArticleURL.js';
import { template } from './template.js';

export const pickArticlesToPublish = async (): Promise<Article[]> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query('SELECT * from info WHERE status = $1::text ORDER BY date DESC LIMIT 20;', [
        'published',
      ])
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

const indexedItems = items
  .map((item) => {
    const parsed = JSON.parse(item.article);

    return {
      id: item.id,
      link: item.link,
      date: item.date,
      title: parsed.title,
      topics: item.topics,
      path: createArticleURL(item.id, item.date).path,
    };
  })
  .sort((a, b) => b.date.getTime() - a.date.getTime());

const article = `  

<div class="card">
  <div class="card-body">
    <ul class="list-group">
    ${indexedItems
    .map(
      (item) =>
        `<li class="list-group-item"><a href="${item.path}">${item.title}</a> - ${item.topics}</li>`,
    )
    .join('\n')}
    </ul> </div>
</div>


    `
const html = template(".", article)

fs.writeFileSync(`./public/index.html`, html);

console.log('published article index');

process.exit(0);
