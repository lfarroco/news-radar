import { Configuration, OpenAIApi } from 'openai';
import { config } from 'https://deno.land/x/dotenv/mod.ts';

const env = config();

const model = 'gpt-3.5-turbo';

export const completion = async (content: string, temperature: number) => {
  console.log(`calling openai, prompt length: ${content.length}`);

  const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      temperature,
    }),
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });

  const output = await response.json();

  const textResponse = output.choices[0].message.content;

  console.log(`openai response: ${textResponse}`);

  return textResponse;
};

const configuration = new Configuration({
  apiKey: env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const priority = async (items: string) => {
  const content = `
You are an editor for a magazine called "Dev Radar" that focuses on programming languages, frameworks and news related to them.
Our intention is to be a "radar" for developers to keep up with the latest news in the industry.
Our magazine publishes articles about the following subjects:
- programming languages
- updates to popular launguages, libraries or frameworks
- new libraries, frameworks and tools
- new features in programming languages
- algorithms and data structures

We don't select articles about the following subjects:
- company-specific news ("company x raises funding", "company y opens a new office")
- politics
- community drama
- programming in general (we talk about specific languages and frameworks)
- low-effort articles (e.g. "how to print hello world in X")
- how to get a job in the industry
- questions (e.g. "what is the best language for X?")
- small patch updates

You will be provided with a list of ids and article titles in the following format: 
(id) - title
Evaluate the ones that should be relevant for our readers based on their title.

Items that are not relevant should be excluded from the response.
Your response should be a JSON array with the ids of the articles that you want to publish.
Don't reply in any format other than JSON, this is very important.
Articles that are not relevant for us should not be included in the response.
Example: 
Payload:
(33) - Rust 3.0 released
(34) - New features for Pandas
(35) - How to print hello world in Rust
Response: [33, 34]
If there are no articles that you want to publish, reply with an empty array: []
Take the necessary time to generate a JSON response with the articles that you want to publish.
Here's the list:
${items}
`;

  return completion(content, 0);
};

export const write = async (id: number, title: string, article: string) => {
  const content = `
You are an editor for a magazine called "Dev Radar" that focuses on programming languages, frameworks and news related to them.
Our intention is to be a "radar" for developers to keep up with the latest news in the industry.

I am going to provide you a scraped article from a website as reference.
The article might contain some noise, so you can ignore it.
The article is about a programming language or framework.
Your job is to write a new version of the article that is suitable for our magazine.
You are free to add more relevant information about the subject.
You can also correct any mistakes in the article.
You should write in third person ("the article shows...", "the author says...").
If the article is incomplete, you can add more information about the subject.
As our target audience are developers, you can include code snippets in the article.
Hightlight informations that are relevant for developers that want to keep up with the latest news in the industry.
If you include html elements in the article, make sure to escape them with backticks (\`).
The article's content should be formatted in raw markdown to define subtitles and code blocks.
Try to keep the generated article up to 125 words (if necessary, you can go over it).
Your response should have the following structure:
- The first line wil be the generated article's title (don't surround it with quotes)
- The second line will be the generated article's content (without the title)
Example:
Rust 1.0 released
Rust, a language that...
Here's the article: 
${title}
${article}
`;

  const response = await completion(content, 0.4);

  return {
    id,
    title: response.split('\n')[0],
    content: response.split('\n').slice(1).join('\n'),
  };
};

export const spin = async (article: string) => {
  const content = `
You are an editor for a magazine called "Dev Radar" that focuses on programming languages, frameworks and news related to them.
Our intention is to be a "radar" for developers to keep up with the latest news in the industry.

I am going to provide you one of our articles that needs some improvements.
I need you to write a new version of the article that is suitable for our magazine.
You can also correct any mistakes in the article.
You should write in third person ("the article shows...", "the author says...").
Assume that the author is biased towards the subject, so you should write in a neutral tone.
As our target audience are developers, you can include code snippets in the article.
Hightlight informations that are relevant for developers that want to keep up with the latest news in the industry.
If you include html elements in the article, make sure to escape them with backticks (\`).
The generated article should have up to 500 words.
The article should be formatted in raw markdown to define subtitles and code blocks.
Your response should have the following structure:
- The first line wil be the generated article's title
- The second line will be the generated article's content (without the title)
Example:
Rust 1.0 released
Rust, a language that...
Here's the article: 
${article}
`;

  return completion(content, 0.4);
};
