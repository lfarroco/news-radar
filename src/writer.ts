import { gpt } from './openai.ts';
import { batch, slugify } from './utils.ts';
import { client } from "./db.ts"
import { Article } from "./models.ts";

const MAX_INPUT_TEXT_LENGTH = 3000;

// asking it to not including because sometimes it generates invalid/blank links :shrug:
const prompt = async (id: number, title: string, article: string) => {
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
The article's content should be formatted in raw markdown.
Try to keep the generated article up to 200 words (if necessary, you can go over it).
Your response should have the following structure:
- The first line wil be the generated article's title
- The second line will be the generated article's content (without the title)
Example:
Rust 1.0 released
Rust, a language that...
Here's the reference article: 
${title}
${article}
`;

  const response = await gpt(content, 0.4)

  return {
    id,
    title: response.split('\n')[0],
    content: response
      .split('\n')
      .slice(1)
      .join('\n'),
  };
};



export const pickArticlesToWrite = async () => {

  const result = await client.queryObject<Article>(
    `SELECT * from info WHERE status = 'scraped';`,
  );
  return result.rows;
};

async function writeArticle(item: Article) {
  const { id, title, content } = await prompt(
    item.id,
    item.title,
    item.original.substring(0, MAX_INPUT_TEXT_LENGTH),
  );

  await client.queryArray(
    'UPDATE info SET status = $1, article_title = $2, article_content =$3, slug = $4 WHERE id = $5;',
    ['published', title, content, slugify(title), id],
  );
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
