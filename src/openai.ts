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
- programming languages in general (we about specific languages and frameworks)
- low-effort articles (e.g. "how to print hello world in X")
- how to get a job in the industry
- questions (e.g. "what is the best language for X")

Here's of ids and article titles in the following format: 
(id) - title
Evaluate the ones that should be relevant for use based on their title: ${items}

Reply with a JSON array with the following structure:
{
  "id": number, // the article's id that was given in the prompt
  "topics": string[] // list of language(s) and framework(s) the article is about
}
Example: [{ "i": 1, "topics": ["Rust"]}, { "i": 4, "topics": ["JavaScript", "React"]}
If there are no articles that you want to publish, reply with an empty array: []
`;

    const engine = 'gpt-3.5-turbo';

    console.log(`calling openai with prompt: ${prompt}`);
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
