import { client } from "../db.ts";
import { Article } from "../models.ts";

export const layout = "article.njk";

export default async function* () {
	const { rows } = await client.queryObject<Article & { url: string; link: string }>(`
    SELECT
      a.id,
      a.title AS article_title,
      a.body AS article_content,
      a.slug,
      a.url,
      a.published_at AS date,
      c.title,
      c.url AS link,
      c.source,
      'published'::text AS status,
      ''::text AS topics,
      ''::text AS original,
      ''::text AS article
    FROM articles a
    INNER JOIN article_tasks t ON t.id = a.task_id
    INNER JOIN candidates c ON c.id = t.candidate_id
    ORDER BY a.published_at DESC;
  `);

	for (const row of rows) {
		const date = new Date(row.date as unknown as string).toISOString().split('T')[0].replace(/-/g, '/');

		yield {
			...row,
			url: row.url,
			title: row.article_title,
			content: row.article_content,
			date,
			formattedDate: date,
		};
	}
}