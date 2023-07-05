import { dbClient } from '../db.ts';
import { template } from './template.ts';
import { slugify } from '../utils.ts';
import { createArticleURL } from './createArticleURL.ts';
import { escapeHTML } from './escapeHTML.ts';

type Topic = {
  topic_id: number;
  article_id: number;
  topics: { name: string };
};

type ArticleRow = {
  id: number;
  article: string;
  date: Date;
  article_topic: {
    topic_id: number;
    article_id: number;
  };
};

export const pickTopics = async (): Promise<Topic[]> => {
  //the query above, but using supabase
  const result = await dbClient
    .from('article_topic')
    .select(
      `
    topic_id,
    article_id,
    topics(name),
    info!inner(id)
    `,
    )
    .eq('info.status', 'published');

  return result.data;
};

export const pickCategoryArticles = async (
  topic_id: number,
): Promise<ArticleRow[]> => {
  // const query = `
  // select info.id as id, info.article as article, info.date as date from article_topic
  // inner join topics on topics.id = topic_id
  // inner join info on info.id = article_topic.article_id
  // WHERE topics.id = $1::int
  // AND info.status = 'published'
  // ORDER BY date DESC
  // `;

  const result = await dbClient
    .from('info')
    .select(
      `
      id,
      article,
      date,
      article_topic!inner(topic_id, article_id)
    `,
    )
    .match({ 'article_topic.topic_id': topic_id, status: 'published' });

  return result.data;
};

export default async () => {
  const topics = await pickTopics();

  const ops = topics.map(async (topic: Topic) => {
    const articles = await pickCategoryArticles(topic.topic_id);

    const listItems = articles
      .map((row) => ({ ...row, date: new Date(row.date) }))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(({ id, article, date }) => {
        const parsed = JSON.parse(article);
        // avoid printing html elements in the title
        const escapedTitle = escapeHTML(parsed.title);
        return `<li class="list-group-item">

<div>
        <a href="../${createArticleURL(id, date).path}">${escapedTitle}</a>
</div>
${date.toDateString()}

        </li>`;
      })
      .join('\n');

    const content = `
  <h2>${topic.topics.name}</h2>
  <ul class="list-group">
    ${listItems}
    </ul> `;

    const html = template('..', content);

    await Deno.writeTextFile(
      `./public/categories/${slugify(topic.topics.name)}.html`,
      html,
    );
  });

  await Promise.all(ops);

  console.log('published category pages');
};
