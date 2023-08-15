import { client } from "../db.ts";
import { Article } from "../models.ts";

export const layout = "article.njk";

export default async function* () {
	const { rows } = await client.queryObject<Article>("SELECT * from info WHERE status = 'published';");

	for (const row of rows) {

		const date = row.date.toISOString().split('T')[0].replace(/-/g, '/');

		yield {
			...row,
			title: row.article_title,
			content: row.article_content,
			date,
			formattedDate: date,
		};
	}
}