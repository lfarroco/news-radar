import { Configuration, OpenAIApi } from 'openai';
import { config } from 'dotenv';

config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const priority = (items: string) =>
  new Promise((resolve: (s: string) => void) => {
    const prompt = `
You are an editor for a magazine called "Dev Radar" that focuses on programming languages, frameworks and news related to them.
Our intention is to be a "radar" for developers to keep up with the latest news in the industry.
Our magazine publishes articles about the following subjects:
- programming languages
- updates to popular launguages, libraries or frameworks
- new libraries, frameworks and tools
- new features in programming languages
- algorithms and data structures

We don't write about the following subjects:
- company-specific news
- politics
- programming in general (we about specific languages and frameworks)
- low-effort articles (e.g. "how to print hello world in X")
- how to get a job in the industry
- questions (e.g. "what is the best language for X")

Here's of ids and article titles in the following format: 
(id) - title
Evaluate the ones that should be relevant for use based on their title: ${items}

Items that are not relevant should be excluded from the response.
The selected items should come as a JSON array with the following structure:
{
  "id": number, // the article's id that was given in the prompt
  "topics": string[] // list of language(s) and framework(s) the article is about
}
Don't reply in any format other than JSON.
Articles that are not relevant for us should not be included in the response.
Example: [{ "i": 1, "topics": ["Rust"]}, { "i": 4, "topics": ["JavaScript", "React"]}
If there are no articles that you want to publish, reply with an empty array: []
`;

    const engine = 'gpt-3.5-turbo';

    console.log(`calling openai, prompt length: ${prompt.length}`);
    openai
      .createChatCompletion({
        model: engine,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      .then((response) => {
        response.data.choices.forEach((choice) => {
          console.log(`openai response: ${choice.message.content}`);
          resolve(choice.message.content);
        });
      });
  });

export const write = (id: number, title: string, article: string) =>
  new Promise((resolve: (result: { id: number; title: string, content: string }) => void) => {
    const prompt = `
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
The generated article should have up to between 500 words.
Your response should have the following structure:
- The first line wil be the generated article's title
- The second line will be the generated article's content (without the title)
Example:
Rust 1.0 released
Rust, a language that...
Here's the article: 
${title}
${article}
`;

    const engine = 'gpt-3.5-turbo';

    console.log(`calling openai with prompt of length: ${prompt.length}`);
    openai
      .createChatCompletion({
        model: engine,
        temperature: 0.4,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      .then((response) => {
        // log total tokens in response
        console.log(`total tokens: ${JSON.stringify(response.data.usage)}`);

        resolve({
          id,
          title: response.data.choices[0].message.content.split('\n')[0],
          content: response.data.choices[0].message.content.split('\n').slice(1).join('\n'),
        });
      });
  });
