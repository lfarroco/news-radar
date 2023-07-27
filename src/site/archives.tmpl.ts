import { client } from "../db.ts";
import { Article } from "../models.ts";

export const layout = "archives.njk";

export default async function* () {

	const { rows } = await client.queryObject<Article>("SELECT * from info WHERE status = 'published' ORDER BY date DESC;");

	// paginate the results
	const pageSize = 20;
	const pageCount = Math.ceil(rows.length / pageSize);

	for (let i = 0; i < pageCount; i++) {

		const page = rows.slice(i * pageSize, (i + 1) * pageSize);

		yield {
			page,
			pageCount,
			pageIndex: i,
			url: `/archives/${i + 1}/`,
			title: `Archives - Page ${i + 1}`,
			results: rows.slice(i * pageSize, (i + 1) * pageSize)
		};
	}

}
