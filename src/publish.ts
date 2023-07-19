import { marked } from './deps.ts';
import { client } from './db.ts';
import { slugify } from './utils.ts';
import { Article } from './models.ts';

type ArticleWithTopics = Article & {
	topics: string;
};

export const pickArticlesToPublish = async () => {

	const { rows } = await client.queryObject<ArticleWithTopics>(
		`SELECT
			info.id,
			info.title,
			info.link,
			info.date,
			info.article,
		    	string_agg(topics.name, ', ') as topics
		FROM info
		INNER JOIN article_topic ON info.id = article_topic.article_id
		INNER JOIN topics ON topics.id = article_topic.topic_id
		WHERE info.status = 'published'
		GROUP BY
			info.id
		ORDER BY
			info.id;`,
	);
	return rows;
};

export default async () => {

	console.log("Publishing articles")

	const items = await pickArticlesToPublish();

	const ops = items.map(async (item) => {

		const parsed = JSON.parse(item.article);

		const year = item.date.getFullYear();
		const month = item.date.getMonth() + 1;
		const day = item.date.getDate();
		const slug = slugify(parsed.title);

		const topics = item.topics.split(',').map((topic: string) => topic.trim())

		const dirPath = `template/articles/${year}/${month}/${day}`;

		await Deno.mkdir(dirPath, { recursive: true });

		const escapedTitle = parsed.title //.replace(/'/g, "\\'");

		marked.setOptions({
			mangle: false,
			headerIds: false,
		});

		const htmlContent = marked(parsed.article);

		await Deno.writeTextFile(`${dirPath}/${slug}.tmpl.json`,
			JSON.stringify({
				layout: "article.njk",
				title: escapedTitle,
				date: item.date.toISOString(),
				formattedDate: `${year}-${month}-${day}`,
				source_link: item.link,
				tags: topics.map(slugify),
				topics: topics.map(topic => ({
					name: topic,
					slug: slugify(topic)
				})),
				content: htmlContent
			})
		)
		await Promise.all(ops)

		console.log("Published articles")

	});

	console.log("Published articles")

}