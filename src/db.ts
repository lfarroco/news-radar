import { Client } from "./deps.ts";
import { Article } from "./models.ts";
import { slugify } from "./utils.ts";

export let client: Client;

export const connect = async (hostname: string, port: number) => {

  console.log(`Connecting to ${hostname}:${port}`);
  client = new Client({
    user: "root",
    hostname,
    password: 'root',
    database: "root",
    port,
  });

  await client.connect();
}

export async function getLatestArticles() {

  const { rows } = await client.queryObject<Article>(`
    SELECT * FROM info 
    WHERE info.status = 'published'
    ORDER BY date DESC
    LIMIT 20`);

  return rows.map(r => {

    const formattedDate = r.date.toISOString().split('T')[0].replace(/-/g, '/');
    return {
      ...r,
      url: `/articles/${formattedDate}/${r.slug}/`,
      formattedDate,
      title: r.article_title
    }
  })
}

export async function getLatestArticlesByTopic(topic: string) {

  const { rows } = await client.queryObject<Article>(`
    SELECT article_title, article_content, date, info.slug as slug FROM info 
    INNER JOIN article_topic ON article_topic.article_id = info.id
    INNER JOIN topics ON topics.id = article_topic.topic_id
    WHERE info.status = 'published' AND topics.slug = $1
    ORDER BY date DESC
    LIMIT 5`, [topic]);

  return rows.map(row => {

    const formattedDate = row.date.toISOString().split('T')[0].replace(/-/g, '/');
    const url = `/articles/${formattedDate}/${row.slug}/`;

    return { ...row, formattedDate, title: row.article_title, article: row.article_content, url }

  })
}

export async function getTopicsList() {

  const { rows } = await client.queryObject<{ topic_id: number, name: string; article_count: number; slug: string; }>(`
    SELECT topic_id, topics.slug, topics.name, count(info.id) as article_count FROM article_topic 
    INNER join info ON info.id = article_id
    INNER join topics ON topics.id = topic_id
    WHERE info.status = 'published'
    GROUP BY topic_id, topics.name, topics.slug
    ORDER BY article_count DESC
    `);

  return rows
}

export async function getTopicArticles(topicId: number) {

  const query = `
		select info.id, info.slug as slug, article_title, article_content, date from article_topic 
		INNER join info on info.id = article_id
		INNER JOIN topics on topics.id = topic_id
		WHERE topics.id = $1 AND info.status = 'published'
		ORDER BY date DESC
		`

  const { rows } = await client.queryObject<{ id: string, article_title: string, article_content: string, slug: string, date: Date }>(query, [topicId]);

  return rows
}
