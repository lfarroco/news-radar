import fs from 'fs';
import { marked } from 'marked';
import { dbClient } from '../db.js';
import { Article } from '../models.js';
import { createArticleURL } from './createArticleURL.js';
import { template } from './template.js';
import { slugify } from '../utils.js';

export const pickArticlesToPublish = async (): Promise<Article[]> => {
  await dbClient.connect();

  const result = await dbClient.query(
    `SELECT * from info WHERE status = 'written' OR status = 'published';`,
  );

  return result.rows;
};

marked.setOptions({
  mangle: false,
  headerIds: false,
});

console.log('picking articles to publish...');
const items = await pickArticlesToPublish();

const topics = await dbClient.query(`SELECT * from topics;`);
const articleTopic = await dbClient.query(`SELECT * from article_topic;`);

console.log('picked articles to publish...');

const operations = items.map(async (raw) => {
  const parsed = JSON.parse(raw.article);
  const item = {
    id: raw.id,
    link: raw.link,
    date: raw.date,
    title: parsed.title,
    article: parsed.article,
    topics: articleTopic.rows.filter((at) => at.article_id === raw.id).map((at) => {
      return topics.rows.find((t) => t.id === at.topic_id);
    }),
  };

  const topicsList = item.topics.map(t=> '<a href="../../../../categories/' + slugify(t.name) + '.html">' + t.name + '</a>').join(', ');
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
  //
  if (!fs.existsSync(publicDatePath)) {
    fs.mkdirSync(publicDatePath, { recursive: true });
  }
  fs.writeFileSync(publicPath, html);

  await dbClient.query(
    'UPDATE info SET status = $1::varchar(32) WHERE id = $2::int;',
    ['published', item.id],
  );
});

await Promise.all(operations);

console.log('published all items');

process.exit(0);
