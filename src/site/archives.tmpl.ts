import { client } from "../db.ts";
import { Article } from "../models.ts";
import { stripLeadingTopicLabel } from "../utils.ts";

export const layout = "archives.njk";

export default async function* () {
	const { rows } = await client.queryObject<Article & { date: Date; topic_name: string }>(`
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

	const normalizedRows = rows.map((row) => ({
		...row,
		article_title: stripLeadingTopicLabel(row.article_title, row.topic_name),
	}));

	// paginate the results
	const pageSize = 20;
	const pageCount = Math.max(1, Math.ceil(normalizedRows.length / pageSize));

	for (let i = 0; i < pageCount; i++) {

		const page = normalizedRows.slice(i * pageSize, (i + 1) * pageSize);

		yield {
			page,
			pageCount,
			pageIndex: i,
			url: `/archives/${i + 1}/`,
			title: `Archives - Page ${i + 1}`,
			results: page,
		};
	}

}
