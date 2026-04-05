import { Client } from "../deps.ts";
import { Article } from "../models.ts";
import { TopicProfile } from "../topics/types.ts";

// ── connection ─────────────────────────────────────────────────────────────

export let client: Client;

export const connect = async (hostname: string, port: number) => {
	console.log(`Connecting to ${hostname}:${port}`);
	client = new Client({
		user: "root",
		hostname,
		password: "root",
		database: "root",
		port,
	});
	await client.connect();
};

// ── article reads ──────────────────────────────────────────────────────────

export const getLatestArticles = async (): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article>(`
    SELECT * FROM info
    WHERE info.status = 'published'
    ORDER BY date DESC
    LIMIT 20`);

	return rows.map((r) => ({
		...r,
		formattedDate: r.date.toISOString().split("T")[0].replace(/-/g, "/"),
		title: r.article_title,
	}));
};

export const getLatestArticlesByTopic = async (
	topic: string,
): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article>(`
    SELECT article_title, article_content, date, info.slug as slug, url FROM info
    INNER JOIN article_topic ON article_topic.article_id = info.id
    INNER JOIN topics ON topics.id = article_topic.topic_id
    WHERE info.status = 'published' AND topics.slug = $1
    ORDER BY date DESC
    LIMIT 5`, [topic]);

	return rows.map((row) => ({
		...row,
		formattedDate: row.date.toISOString().split("T")[0].replace(/-/g, "/"),
		title: row.article_title,
		article: row.article_content,
	}));
};

export const getTopicsList = async () => {
	const { rows } = await client.queryObject<{
		topic_id: number;
		name: string;
		article_count: number;
		slug: string;
	}>(`
    SELECT topic_id, topics.slug, topics.name, count(info.id) as article_count FROM article_topic
    INNER JOIN info ON info.id = article_id
    INNER JOIN topics ON topics.id = topic_id
    WHERE info.status = 'published'
    GROUP BY topic_id, topics.name, topics.slug
    ORDER BY article_count DESC`);
	return rows;
};

export const getTopicArticles = async (topicId: number) => {
	const { rows } = await client.queryObject<{
		id: string;
		url: string;
		article_title: string;
		article_content: string;
		slug: string;
		date: Date;
	}>(`
    SELECT info.id, url, info.slug as slug, article_title, article_content, date FROM article_topic
    INNER JOIN info ON info.id = article_id
    INNER JOIN topics ON topics.id = topic_id
    WHERE topics.id = $1 AND info.status = 'published'
    ORDER BY date DESC`, [topicId]);
	return rows;
};

// ── pipeline reads ─────────────────────────────────────────────────────────

export const getPendingArticles = async (): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article>(
		`SELECT * FROM info WHERE status = 'pending';`,
	);
	return rows;
};

export const getApprovedArticles = async (): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article>(
		`SELECT * FROM info WHERE status = 'approved';`,
	);
	return rows;
};

export const getScrapedArticles = async (): Promise<Article[]> => {
	const { rows } = await client.queryObject<Article>(
		`SELECT * FROM info WHERE status = 'scraped';`,
	);
	return rows;
};

export const getArticlesByIds = async (ids: number[]): Promise<Article[]> => {
	if (ids.length === 0) return [];

	const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
	const query = `SELECT * FROM info WHERE id IN (${placeholders});`;
	const { rows } = await client.queryObject<Article>(query, ids);
	return rows;
};

// ── article writes ─────────────────────────────────────────────────────────

export const insertArticle = (
	title: string,
	link: string,
	source: string,
	date: Date,
	original: string,
) =>
	client.queryArray(
		`INSERT INTO info (title, link, source, date, status, original)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     ON CONFLICT (link) DO NOTHING;`,
		[title, link, source, date, original],
	);

export const setArticleStatus = (
	id: number,
	status: string,
	modelUsed?: string,
) =>
	client.queryArray(
		`UPDATE info SET status = $1, model_used = COALESCE($3, model_used) WHERE id = $2;`,
		[status, id, modelUsed ?? null],
	);

export const setArticleStatusByLink = (link: string, status: string) =>
	client.queryArray(
		`UPDATE info SET status = $1 WHERE link = $2;`,
		[status, link],
	);

export const setArticleScraped = (link: string, content: string) =>
	client.queryArray(
		`UPDATE info SET status = 'scraped', original = $1 WHERE link = $2;`,
		[content, link],
	);

export const publishArticle = (
	id: number,
	title: string,
	content: string,
	slug: string,
	url: string,
	modelUsed: string,
) =>
	client.queryArray(
		`UPDATE info SET status = 'published', article_title = $2, article_content = $3, slug = $4, url = $5, model_used = $6 WHERE id = $1;`,
		[id, title, content, slug, url, modelUsed],
	);

// ── topic writes ───────────────────────────────────────────────────────────

export const upsertTopic = (name: string, slug: string) =>
	client.queryArray(
		`INSERT INTO topics (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING;`,
		[name, slug],
	);

export const linkArticleTopic = (articleLink: string, topicSlug: string) =>
	client.queryArray(
		`INSERT INTO article_topic (article_id, topic_id)
     VALUES (
       (SELECT id FROM info WHERE link = $1),
       (SELECT id FROM topics WHERE slug = $2)
     ) ON CONFLICT (article_id, topic_id) DO NOTHING;`,
		[articleLink, topicSlug],
	);

export const linkArticleTopicById = (
	articleId: number,
	topicSlug: string,
) =>
	client.queryArray(
		`INSERT INTO article_topic (article_id, topic_id)
     VALUES ($1, (SELECT id FROM topics WHERE slug = $2))
     ON CONFLICT (article_id, topic_id) DO NOTHING;`,
		[articleId, topicSlug],
	);

// ── topic knowledge base ───────────────────────────────────────────────────

export const upsertTopicProfile = (slug: string, profile: TopicProfile) =>
	client.queryArray(
		`UPDATE topics SET profile = $2 WHERE slug = $1;`,
		[slug, JSON.stringify(profile)],
	);

export const getTopicProfile = async (
	slug: string,
): Promise<TopicProfile | null> => {
	const { rows } = await client.queryObject<{ profile: TopicProfile }>(
		`SELECT profile FROM topics WHERE slug = $1;`,
		[slug],
	);
	return rows[0]?.profile ?? null;
};

export const getAllTopicProfiles = async (): Promise<TopicProfile[]> => {
	const { rows } = await client.queryObject<{ profile: TopicProfile | null }>(
		`SELECT profile FROM topics WHERE profile IS NOT NULL;`,
	);

	return rows
		.map((row) => row.profile)
		.filter((profile): profile is TopicProfile => profile !== null);
};
