import { cheerio } from './deps.ts';
import { connect, client } from './db.ts';
import getFiles from "https://deno.land/x/getfiles@v1.0.0/mod.ts";
import { slugify } from './utils.ts';

await connect("localhost", 15432)

//did you accidently deleted the db? fear not! the output html pages are sort a backup ;)

const ingestArticle = async (filePath: string) => {

	const content = await Deno.readTextFile(filePath);

	const $ = cheerio.load(content);

	const title = $('article .card-header h1').text();
	const date = $('article .card-header small').text();
	const link = $('.disclaimer a').attr('href')
	const body = $('article .card-body')

	body.find('.disclaimer').remove()

	const body_html = body.html().trim()

	const query = `
	INSERT INTO info (article_title, article_content, date, link, status, source )
	VALUES ($1,$2, $3, $4,'published', 'restore-script')
	ON CONFLICT (link) DO NOTHING;
	`
	console.log(query)
	await client.queryArray(query, [title, body_html, date, link])

}


const files = getFiles({
	root: './_site/articles/2023',
});

files.forEach(async (file) => {
	await ingestArticle(file.realPath)
})

const ingestTopic = async (path: string) => {

	const content = await Deno.readTextFile(path);

	const $ = cheerio.load(content);

	const topic = $('.card-header h1').text()

	const createTopic = `
		INSERT INTO topics (name, slug)
		VALUES ($1, $2)
		ON CONFLICT (name) DO NOTHING;
		`
	await client.queryArray(createTopic, [topic, slugify(topic)])

	const topicResponse = await client.queryObject<{ id: number }>(`SELECT id from topics where name = $1`, [topic])
	const { id: topicId } = topicResponse.rows[0]

	const items = $('.list-group-item a').toArray()

	for (const item of items) {
		const title = $(item).text()

		const query = `
		SELECT id from info where article_title = $1;
		`
		const result = await client.queryObject<{ id: number }>(query, [title])
		const queryResult = result.rows[0]

		if (!queryResult) {
			console.log("not found", title, topic)
			continue
		}

		const { id } = queryResult

		const relationQuery = `
		INSERT INTO article_topic (article_id, topic_id)
		VALUES ($1, $2)
		ON CONFLICT (article_id, topic_id) DO NOTHING;
		`
		await client.queryArray(relationQuery, [id, topicId])
	}

}

const topics = getFiles({
	root: './_site/topics',
});

topics.forEach(async file => {
	await ingestTopic(file.realPath)
})