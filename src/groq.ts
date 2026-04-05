import { loadConfig } from "./config.ts";

const config = loadConfig();

type GroqChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
	error?: {
		message?: string;
	};
};

export const gpt = async (content: string, temperature: number) => {
	const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.GROQ_API_KEY}`,
		},
		body: JSON.stringify({
			model: config.GROQ_MODEL,
			temperature,
			messages: [{ role: "user", content }],
		}),
	});

	const data = await response.json() as GroqChatCompletionResponse;

	if (!response.ok) {
		throw new Error(data.error?.message ?? "Groq request failed");
	}

	const message = data.choices?.[0]?.message?.content;
	if (!message) {
		throw new Error("Groq response did not include message content");
	}

	console.log(`groq response: ${message}`);

	return message;
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

	return await gpt(content, 0.4);
};