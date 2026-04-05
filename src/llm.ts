import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { loadConfig } from "./config.ts";
const config = loadConfig();

export const makeLlm = (temperature = 0) =>
	new ChatOpenAI({
		model: config.OPENAI_MODEL,
		temperature,
		apiKey: config.OPENAI_API_KEY,
	});

// ── reusable prompt builders ───────────────────────────────────────────────

export const systemUserPrompt = (system: string, user: string) =>
	ChatPromptTemplate.fromMessages([
		["system", system],
		["human", user],
	]);

// ── structured output helpers ──────────────────────────────────────────────

export const relevanceOutputSchema = z.object({
	selected: z
		.array(z.number())
		.describe("IDs of articles relevant to the target audience"),
});

export const articleOutputSchema = z.object({
	title: z.string().describe("Generated article title"),
	content: z
		.string()
		.describe("Article body formatted in raw markdown, up to 200 words"),
	categories: z
		.array(z.string())
		.describe("Topic/category tags for this article"),
});

export type RelevanceOutput = z.infer<typeof relevanceOutputSchema>;
export type ArticleOutput = z.infer<typeof articleOutputSchema>;
