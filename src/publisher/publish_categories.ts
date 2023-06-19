import fs from 'fs';
import { dbClient } from '../db.js';
import { template } from './template.js';
import { batch, slugify } from '../utils.js';
import {createArticleURL} from './createArticleURL.js';
import {escapeHTML} from './escapeHTML.js';

type Topic = {
  topic_id: number;
  article_id: number;
  topic_name: string;
};

type ArticleRow = {
  id: number;
  title: string;
  date: Date;
};

await dbClient.connect();

export const pickTopics = async (): Promise<Topic[]> => {
  const result = await dbClient.query(`
    select topic_id, article_id, topics.name as topic_name from article_topic
    inner join topics on topics.id = topic_id
    inner join info on info.id = article_topic.article_id
    WHERE info.status = 'published'
    `);

  return result.rows;
};

export const pickCategoryArticles = async (
  topic_id: number,
): Promise<ArticleRow[]> => {
  const query = `
  select info.id as id, info.title as title, info.date as date from article_topic
  inner join topics on topics.id = topic_id
  inner join info on info.id = article_topic.article_id
  WHERE topics.id = $1::int
  AND info.status = 'published'
  ORDER BY date DESC
  `;

  const result = await dbClient.query(query, [topic_id]);

  return result.rows;
};

const topics = await pickTopics();

await batch(topics, 1, async (topic: Topic) => {
  const articles = await pickCategoryArticles(topic.topic_id);

  const listItems = articles
    .map(
      ({ id, title, date }) =>{
        // avoid printing html elements in the title
        const escapedTitle = escapeHTML(title);
        return `<li class="list-group-item"><a href="../${createArticleURL(id, date).path}">${escapedTitle}</a></li>`
      }
    )
    .join('\n');

  const list = `<ul class="list-group">
    ${listItems}
    </ul> `;

  const html = template('..', list);

  fs.writeFileSync(`./public/categories/${slugify(topic.topic_name)}.html`, html);
});

console.log('published category pages');

process.exit(0);

