import { client } from "../db.ts";
import { Article } from "../models.ts";
import { stripLeadingTopicLabel } from "../utils.ts";

export const layout = "article.njk";

export default async function* () {
  const { rows } = await client.queryObject<Article & { url: string; link: string; topic_name: string }>(`
    SELECT
      a.id,
      a.title AS article_title,
      a.body AS article_content,
      a.slug,
      a.url,
      a.published_at AS date,
      t.name AS topic_name,
      c.title,
      c.url AS link,
      c.source,
      'published'::text AS status,
      ''::text AS topics,
      ''::text AS original,
      ''::text AS article
    FROM articles a
    INNER JOIN topics t ON t.id = a.topic_id
    INNER JOIN article_tasks at ON at.id = a.task_id
    INNER JOIN candidates c ON c.id = at.candidate_id
    ORDER BY a.published_at DESC;
  `);

  for (const row of rows) {
    const date = new Date(row.date as unknown as string).toISOString().split('T')[0].replace(/-/g, '/');

    yield {
      ...row,
      url: row.url,
      title: stripLeadingTopicLabel(row.article_title, row.topic_name),
      content: row.article_content,
      date,
      formattedDate: date,
    };
  }
}