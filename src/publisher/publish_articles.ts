import { marked } from 'marked';
import { dbClient } from '../db.ts';
import { Article } from '../models.ts';
import { createArticleURL } from './createArticleURL.ts';
import { template } from './template.ts';
import { slugify } from '../utils.ts';
import { exists } from 'https://deno.land/std/fs/mod.ts';

export const pickArticlesToPublish = async (): Promise<Article[]> => {
  const result = await dbClient
    .from('info')
    .select('id, article, date, link')
    .eq('status', 'published');

  return result.data;
};

marked.setOptions({
  mangle: false,
  headerIds: false,
});

export default async () => {
  console.log('picking articles to publish...');
  const items = await pickArticlesToPublish();

  const topics = await dbClient.from('topics').select('*');
  const articleTopic = await dbClient.from('article_topic').select('*');

  console.log('picked articles to publish...');

  const operations = items.map(async (raw) => {
    const parsed = JSON.parse(raw.article);
    const item = {
      id: raw.id,
      link: raw.link,
      date: new Date(raw.date),
      title: parsed.title,
      article: parsed.article,
      topics: articleTopic.data
        .filter((at) => at.article_id === raw.id)
        .map((at) => {
          return topics.data.find((t) => t.id === at.topic_id);
        }),
    };

    const topicsList = item.topics
      .map(
        (t) =>
          '<a href="../../../../categories/' +
          slugify(t.name) +
          '.html">' +
          t.name +
          '</a>',
      )
      .join(', ');
    const renderedDate = item.date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const content = `
  <div class="card">
  <div class="card-body">
    <article>
        <h1>${item.title}</h1>
        <div>${renderedDate} | Topics:  ${topicsList}</div>
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

    //write to a file synchronously
    const { publicDatePath, publicPath } = createArticleURL(item.id, item.date);

    // create directory if it doesn't exist
    const dirExists = await exists(publicDatePath);

    if (!dirExists) await Deno.mkdir(publicDatePath, { recursive: true });

    await Deno.writeTextFile(publicPath, html);
  });

  await Promise.all(operations);

  console.log('published all items');
};
