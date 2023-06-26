import fs from 'fs';
import { dbClient } from '../db.js';
import { template } from './template.js';
import { Article } from '../models.js';
import { createArticleURL } from './createArticleURL.js';
import { escapeHTML } from './escapeHTML.js';
import { group } from '../utils.js';

export const pickArticles = async (): Promise<Article[]> => {
  await dbClient.connect();

  const { rows } = await dbClient.query(
    ` SELECT * from info where status = 'published' or status='written' order by created_at desc;`,
  );
  return rows;
};

const items = await pickArticles();

const listItems = items.map(({ id, article, date }) => {
  const parsed = JSON.parse(article);
  const escapedTitle = escapeHTML(parsed.title);
  return `<li class="list-group-item">
            <div>
              <a href="../${
                createArticleURL(id, date).path
              }">${escapedTitle}</a>
            </div> 
            ${date.toDateString()}
          </li>`;
});


const pages = group(listItems, 20)

const ops = pages.map(async (page, index, arr) => {
  const total = arr.length;

  const maybePrevious =
    index > 0
      ? `<li class="page-item"><a class="page-link" href="page-${index}.html">Previous</a></li>`
      : '';

  const maybeNext =
    index < total - 1
      ? `<li class="page-item"><a class="page-link" href="page-${
          index + 2
        }.html">Next</a></li>`
      : '';

  const nav = `
    <nav>
      <ul class="pagination">
        ${maybePrevious}
        ${maybeNext}
      </ul>
    </nav>`;

  const content = `
     <h2>Page ${index + 1}</h2>
     <ul class="list-group">
         ${nav}
         ${page.join('\n')}
         ${nav}
     </ul> `;

  const html = template('..', content);

  fs.writeFileSync(`./public/archives/page-${index + 1}.html`, html);

  await new Promise((resolve) => resolve(0));
});

await Promise.all(ops);

console.log('published archives');

process.exit(0);
