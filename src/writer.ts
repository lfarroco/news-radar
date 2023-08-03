import { gpt } from './openai.ts';
import { batch, slugify } from './utils.ts';
import { client } from "./db.ts"
import { Article } from "./models.ts";

const MAX_INPUT_TEXT_LENGTH = 3000;

// asking it to not including because sometimes it generates invalid/blank links :shrug:
const prompt = async (title: string, article: string) => {
  const content = `
You are an editor for a magazine called "Dev Radar" that focuses on programming languages, frameworks and news related to them.
Our intention is to be a "radar" for developers to keep up with the latest news in the industry.

I am going to provide you a text scraped from a website as reference.
The article is about a programming language or framework.
Your job is to write a summary of the article that is suitable for our magazine.
You are free to add more relevant information about the subject.
You can also correct any mistakes in the article.
You should write in third person ("the article shows...", "the author says...").
Hightlight informations that are relevant for developers that want to keep up with the latest news in the industry.
If you include html elements in the article, make sure to escape them with backticks (\`).
Don't include links in the article.
You should generate a new title for the article.
The article's content should be formatted in raw markdown.
Try to keep the generated article up to 200 words (if necessary, you can go over it).
Your response should coome as a JSON with the following structure:
{
  "title": "A title that you generated for this article (should not be equal to the source article)",
  "content": "The article content that you generated",
  "categories": ["Category 1", "Category 2"]
}
Example response:
{
  "title": "XPTO: A new Rust framework",
  "content": "The XPTO framework...",
  "categories": ["Rust", "XPTO"]
}
Don't respond with anything else than the JSON. This is very important.
Here's the reference article: 
${title}
${article}
`;

  const response = await gpt(content, 0.4)

  return JSON.parse(response) as { title: string, content: string, categories: string[] }
};



export const pickArticlesToWrite = async () => {

  const result = await client.queryObject<Article>(
    `SELECT * from info WHERE status = 'scraped';`,
  );
  return result.rows;
};

async function writeArticle(item: Article) {
  const { title, content, categories } = await prompt(
    item.title,
    item.original.substring(0, MAX_INPUT_TEXT_LENGTH),
  );

  const formattedDate = item.date.toISOString().split('T')[0].replace(/-/g, '/');
  const url = `/articles/${formattedDate}/${slugify(title)}/`;

  await client.queryArray(
    'UPDATE info SET status = $1, article_title = $2, article_content =$3, slug = $4, url=$5 WHERE id = $6;',
    ['published', title, content, slugify(title), url, item.id],
  );

  const categoryOps = categories.map(async (category) => {

    // TODO: make slug unique
    await client.queryArray(`INSERT INTO topics (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
      [category, slugify(category)])

    await client.queryArray(
      `INSERT INTO article_topic (article_id, topic_id) VALUES ($1, (SELECT id FROM topics WHERE slug = $2))
      ON CONFLICT (article_id, topic_id) DO NOTHING;
      `,
      [item.id, slugify(category)],
    );

  });

  await Promise.all(categoryOps)


  console.log(`wrote article "${title}" with content ${content}...`);
}

export default async () => {
  console.log('writer started:');

  const items = await pickArticlesToWrite();

  console.log(
    'articles',
    items.map((a) => a.title),
  );

  await batch(items, 3, writeArticle);

  console.log('writer finished');
}
