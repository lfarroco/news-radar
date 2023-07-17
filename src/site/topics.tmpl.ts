import { getTopicArticles, getTopicsList } from "../db.ts";
import { slugify } from "../utils.ts";

export const layout = "topic.njk";

export default async function* () {
	const rows = await getTopicsList();

	for (const { topic_id, name } of rows) {

		const articles = await getArticles(topic_id)

		yield {
			url: `/topics/${slugify(name)}/`,
			title: name,
			articles
		};

	}
}

async function getArticles(topic_id: number) {

	const rows = await getTopicArticles(topic_id);

	return rows.map(({ article, date }) => {

		const parsed = JSON.parse(article);

		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const dateStr = `${year}/${month}/${day}`;

		return {
			url: `/articles/${dateStr}/${slugify(parsed.title)}/`,
			title: parsed.title,
			date: date.toUTCString(),
			formattedDate: date.toISOString().split('T')[0],
		}
	});

}