import { Client } from "./deps.ts";
import { Article } from "./models.ts";
import { slugify } from "./utils.ts";

export let client: Client;

export const connect = async (hostname: string, port: number) => {
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

  if (!client)
    await connect("localhost", 15432);

  const { rows } = await client.queryObject<Article>(`
    SELECT * FROM info 
    WHERE info.status = 'published'
    ORDER BY date DESC
    LIMIT 20`);

  return rows.map(r => {

    const parsed = JSON.parse(r.article);
    const formattedDate = r.date.toISOString().split('T')[0].replace(/-/g, '/');
    return {
      ...r,
      url: `/articles/${formattedDate}/${slugify(parsed.title)}/`,
      formattedDate,
    }
  })
}

export async function getLatestArticlesByTopic(topic: string) {

  if (!client)
    await connect("localhost", 15432);

  const { rows } = await client.queryObject<Article>(`
    SELECT article, date FROM info 
    INNER JOIN article_topic ON article_topic.article_id = info.id
    INNER JOIN topics ON topics.id = article_topic.topic_id
    WHERE info.status = 'published' AND topics.slug = $1
    ORDER BY date DESC
    LIMIT 5`, [topic]);

  return rows.map(row => {

    const parsed = JSON.parse(row.article);
    const formattedDate = row.date.toISOString().split('T')[0].replace(/-/g, '/');
    const url = `/articles/${formattedDate}/${slugify(parsed.title)}/`;

    return { ...row, formattedDate, title: parsed.title, article: parsed.article, url }

  })
}

export async function getTopicsList() {

  if (!client)
    await connect("localhost", 15432);

  const { rows } = await client.queryObject<{ topic_id: number, name: string; article_count: number }>(`
    SELECT topic_id, topics.name, count(info.id) as article_count FROM article_topic 
    INNER join info ON info.id = article_id
    INNER join topics ON topics.id = topic_id
    WHERE info.status = 'published'
    GROUP BY topic_id, topics.name
    ORDER BY article_count DESC
    `);

  return rows
}

export async function getTopicArticles(topicId: number) {

  if (!client)
    await connect("localhost", 15432);

  const query = `
		select info.id, article, date from article_topic 
		INNER join info on info.id = article_id
		INNER JOIN topics on topics.id = topic_id
		WHERE topics.id = $1 AND info.status = 'published'
		ORDER BY date DESC
		`

  const { rows } = await client.queryObject<{ id: string, article: string, date: Date }>(query, [topicId]);

  return rows
}