import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { loadConfig } from "./config.ts";
const config = loadConfig();

export const makeLlm = (temperature = 0) =>
	new ChatGroq({
		model: config.GROQ_MODEL,
		temperature,
		apiKey: config.GROQ_API_KEY,
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

export const plannerOutputSchema = z.object({
	plans: z.array(z.object({
		title: z.string().describe("Planned article title"),
		angle: z.string().describe("Editorial angle for the article"),
		sourceArticleIds: z
			.array(z.number())
			.describe("IDs of scanned source items used for this article"),
		primarySourceId: z
			.number()
			.describe("Primary source row ID where this final article will be published"),
		topicHints: z
			.array(z.string())
			.describe("Topic tags expected for this article"),
	})),
});

export type RelevanceOutput = z.infer<typeof relevanceOutputSchema>;
export type ArticleOutput = z.infer<typeof articleOutputSchema>;
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
