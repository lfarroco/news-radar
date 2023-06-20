import fs from 'fs';
import { dbClient } from '../db.js';
import { Article } from '../models.js';
import { createArticleURL } from './createArticleURL.js';
import { template } from './template.js';
import { slugify } from '../utils.js';

export const pickArticlesToPublish = async (): Promise<Article[]> => {
  await dbClient.connect();

  const { rows } = await dbClient.query(
    `SELECT * from info WHERE status = 'published' ORDER BY date DESC LIMIT 20;`,
  );
  return rows;
};

console.log('picking articles to publish...');
const items = await pickArticlesToPublish();
console.log('picked articles to publish...');
if (items.length === 0) {
  console.log('no articles to publish');
  process.exit(0);
}

const topics = await dbClient.query(`SELECT * from topics;`);
const articleTopic = await dbClient.query(`SELECT * from article_topic;`);

const indexedItems = items
  .map((item) => {
    const parsed = JSON.parse(item.article);

    return {
      id: item.id,
      link: item.link,
      date: item.date,
      title: parsed.title,
      path: createArticleURL(item.id, item.date).path,
      topics: articleTopic.rows
        .filter((at) => at.article_id === item.id)
        .map((at) => {
          return topics.rows.find((t) => t.id === at.topic_id);
        }),
    };
  })
  .sort((a, b) => b.date.getTime() - a.date.getTime());

const js = themeColumn('JavaScript');
const py = themeColumn('Python');
const rs = themeColumn('Rust');
const react = themeColumn('React');
const content = `
<div class="card mb-2">
  <div class="card-body">
    Dev Radar is an AI-powered news aggregator that helps you stay up to date with the latest trends in software development. <br/>
    Below are the latest articles that our AI 🤖 has found for you.
  </div>
</div>
<div class="row mb-2">
  ${js}
  ${py}
  ${rs}
  ${react}
</div>

<div class="row">
  ${latest()}
</div>
`;

const html = template('.', content);

fs.writeFileSync(`./public/index.html`, html);

console.log('published article index');

process.exit(0);
function themeColumn(topicName: string) {
  return `  

<div class="col">
  <div class="card">
    <div class="card-header bg-dark text-light">
    <h3> ${topicName} </h3>
    </div>
    <div class="card-body">
      <ul class="list-group article-list">
      ${indexedItems
        .filter((i) => i.topics.find((t) => t.name === topicName))
        .slice(0,5)
        .map((item) => {
          const topicRows = articleTopic.rows.filter(
            (at) => at.article_id === item.id,
          );
          const topicInfo = topicRows
            .map((at) => {
              return topics.rows.find((t) => t.id === at.topic_id);
            })
            .map(
              (t) =>
                `<a href="/categories/${slugify(t.name)}.html">${t.name}</a>`,
            )
            .join(', ');
          console.log(topicInfo);
          return `<li class="list-group-item"> 
                              <div> <a  class="article-title" href="${
                                item.path
                              }">${item.title}</a> </div>
            <div>${
              item.date.toISOString().split('T')[0]
            } | Topics: ${topicInfo} </div>
                            </li>`;
        })
        .join('\n')}
      </ul> 
    </div>
  </div>
</div>

    `;
}

function latest() {
  return `  

<div class="col">
  <div class="card">
    <div class="card-header bg-dark text-light">
    <h3> Latest Articles </h3>
    </div>
    <div class="card-body">
      <ul class="list-group article-list">
      ${indexedItems
        .slice(0,20)
        .map((item) => {
          const topicRows = articleTopic.rows.filter(
            (at) => at.article_id === item.id,
          );
          const topicInfo = topicRows
            .map((at) => {
              return topics.rows.find((t) => t.id === at.topic_id);
            })
            .map(
              (t) =>
                `<a href="/categories/${slugify(t.name)}.html">${t.name}</a>`,
            )
            .join(', ');
          console.log(topicInfo);
          return `<li class="list-group-item"> 
                              <div> <a  class="article-title" href="${
                                item.path
                              }">${item.title}</a> </div>
            <div>${
              item.date.toISOString().split('T')[0]
            } | Topics: ${topicInfo} </div>
                            </li>`;
        })
        .join('\n')}
      </ul> 
    </div>
  </div>
</div>

    `;
}
