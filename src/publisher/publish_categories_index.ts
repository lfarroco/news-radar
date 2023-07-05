import { dbClient } from '../db.ts';
import { template } from './template.ts';
import { slugify } from '../utils.ts';

type Row = {
  topic_id: number;
  article_id: string;
  info: { id: number };
  topics: { name: string };
};

export const pickCategories = async () => {
  const response = await dbClient
    .from('article_topic')
    .select(
      `
      topic_id,
      article_id,
      info!inner(id),
      topics(name)
      `,
    )
    .eq('info.status', 'published');

  const { data } = response;

  return data as Row[];
};

export default async () => {
  console.log('picking categories and their count...');
  const items = await pickCategories();
  console.log('picked categories...');

  const countIndex = Object.entries(
    items.reduce((acc, item) => {
      if (!acc[item.topics.name]) {
        acc[item.topics.name] = 0;
      }

      acc[item.topics.name]++;

      return acc;
    }, {} as { [x: string]: number }),
  ).sort(([, a], [, b]) => b - a);

  const listItems = countIndex
    .map(
      ([name, count]) =>
        `<li class="list-group-item"><a href="categories/${slugify(
          name,
        )}.html">${name}</a> -   <span class="badge bg-primary rounded-pill">${count}</span></li>`,
    )
    .join('\n');

  const content = `
<h2>Topics</h2>
<ul class="list-group">
    ${listItems}
    </ul> `;

  const html = template('.', content);

  await Deno.writeTextFile(`./public/categories.html`, html);

  console.log('published categories index');
};
