import { dbClient } from '../db.ts';
import { template } from './template.ts';
import { Article } from '../models.ts';
import { createArticleURL } from './createArticleURL.ts';
import { escapeHTML } from './escapeHTML.ts';
import { group } from '../utils.ts';

export const pickArticles = async (): Promise<Article[]> => {
  const { data } = await dbClient
    .from('info')
    .select('id, article, date')
    .eq('status', 'published')
    .order('date', { ascending: false });
  return data;
};

export default async () => {
  const items = await pickArticles();

  const listItems = items.map(({ id, article, date }) => {
    const parsed = JSON.parse(article);
    const escapedTitle = escapeHTML(parsed.title);
    return `<li class="list-group-item">
            <div>
              <a href="../${
                createArticleURL(id, new Date(date)).path
              }">${escapedTitle}</a>
            </div> 
            ${date}
          </li>`;
  });

  const pages = group(listItems, 20);

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

    await Deno.writeTextFile(`./public/archives/page-${index + 1}.html`, html);
  });

  await Promise.all(ops);

  console.log('published archives');
};
