import { getTopicArticles, getTopicsList } from "../db.ts";

export const layout = "topicFeed.njk";

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
	const topics = await getTopicsList();

	for (const { topic_id, name, slug } of topics) {
		const articles = await getTopicArticles(topic_id);
		const feedPath = `/topics/${slug}/feed.xml`;
		const topicPath = `/topics/${slug}/`;

		yield {
			url: feedPath,
			contentType: "application/rss+xml; charset=UTF-8",
			title: `${name} News`,
			description: `Latest ${name} headlines from Dev Radar`,
			feedUrl: toAbsoluteUrl(feedPath),
			topicUrl: toAbsoluteUrl(topicPath),
			lastBuildDate: new Date().toUTCString(),
			articles: articles.slice(0, 30).map((article) => ({
				title: article.article_title,
				url: toAbsoluteUrl(article.url),
				description: toDescription(article.article_content),
				pubDate: article.date.toUTCString(),
				guid: article.url,
			})),
		};
	}
}