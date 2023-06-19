import fs from 'fs';
import { dbClient } from '../db.js';
import { template } from './template.js';
import { slugify } from '../utils.js';

type Row = {
  id: number;
  name: string;
  count: number;
};

export const pickCategories = async (): Promise<Row[]> =>
  new Promise(async (resolve) => {
    await dbClient.connect();

    dbClient
      .query(
        `
select topic_id as id, topics.name, count(article_id) from article_topic
inner join topics on topics.id = topic_id
inner join info on info.id = article_topic.article_id
WHERE info.status = 'published'
group by topic_id, topics.name
order by count DESC
`,
      )
      .then((result: { rows: Row[] }) => {
        resolve(result.rows);
      });
  });

console.log('picking categories and their count...');
const items = await pickCategories();
console.log('picked categories...');
if (items.length === 0) {
  console.log('no categories to publish');
  process.exit(0);
}

const listItems = items
  .map(
    ({ name, count }) =>
      `<li class="list-group-item"><a href="categories/${slugify(
        name,
      )}.html">${name}</a> -   <span class="badge bg-primary rounded-pill">${count}</span></li>`,
  )
  .join('\n');

const article = `<ul class="list-group">
    ${listItems}
    </ul> `;

const html = template('.', article);

fs.writeFileSync(`./public/categories.html`, html);

console.log('published categories index');

process.exit(0);
