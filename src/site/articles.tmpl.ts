import { client, connect } from "../db.ts";
import { Article } from "../models.ts";
import { slugify } from "../utils.ts";

export const layout = "article.njk";

await connect("localhost", 15432);

export default async function* () {
	const { rows } = await client.queryObject<Article>("SELECT * from info WHERE status = 'published';");

	for (const row of rows) {
		const parsed = JSON.parse(row.article);

		const year = row.date.getFullYear();
		const month = row.date.getMonth() + 1;
		const day = row.date.getDate();
		const date = `${year}/${month}/${day}`;
		yield {
			...row,
			url: `/articles/${date}/${slugify(parsed.title)}/`,
			title: parsed.title,
			content: parsed.article,
			date: row.date.toUTCString(),
		};
	}
}