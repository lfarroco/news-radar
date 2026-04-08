import { getTopicArticles, getTopicsList } from "../db.ts";

const SITE_URL = Deno.env.get("SITE_URL")?.replace(/\/$/, "") ?? "https://dev-radar.pages.dev";

const toAbsoluteUrl = (value: string): string => {
	if (/^https?:\/\//i.test(value)) {
		return value;
	}
	return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
};

const toDescription = (value: string): string =>
	(value ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 280);

export default async function* () {
	const rows = await getTopicsList();

	for (const { topic_id, name, slug } of rows) {

		const articles = await getArticles(topic_id)

		yield {
			url: `/topics/${slug}/`,
			layout: "topic.njk",
			title: name,
			slug,
			feedUrl: `/topics/${slug}/feed/`,
			articles
		};

		yield {
			url: `/topics/${slug}/feed/`,
			layout: "topicFeed.njk",
			contentType: "application/rss+xml; charset=UTF-8",
			title: `${name} News`,
			description: `Latest ${name} headlines from Dev Radar`,
			feedUrl: toAbsoluteUrl(`/topics/${slug}/feed/`),
			topicUrl: toAbsoluteUrl(`/topics/${slug}/`),
			lastBuildDate: new Date().toUTCString(),
			articles: articles.slice(0, 30).map((article) => ({
				title: article.title,
				url: toAbsoluteUrl(article.url),
				description: toDescription(article.article ?? ""),
				pubDate: article.date,
				guid: toAbsoluteUrl(article.url),
			})),
		};

	}
}

async function getArticles(topic_id: number) {

	const rows = await getTopicArticles(topic_id);

	return rows.map(({ article_title, article_content, date, url }) => {

		return {
			url,
			title: article_title,
			article: article_content,
			date: date.toUTCString(),
			formattedDate: date.toISOString().split('T')[0],
		}
	});

}