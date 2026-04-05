import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { loadConfig } from "../config.ts";

const config = loadConfig();

const TAVILY_API_URL = "https://api.tavily.com/search";

export type ResearchSource = {
	title: string;
	url: string;
	content: string;
	score?: number;
};

type TavilyResponse = {
	results?: Array<{
		title?: string;
		url?: string;
		content?: string;
		score?: number;
	}>;
};

export const searchOnlineSources = async (
	query: string,
	maxResults = 5,
): Promise<ResearchSource[]> => {
	if (!config.TAVILY_API_KEY) return [];

	const res = await fetch(TAVILY_API_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			api_key: config.TAVILY_API_KEY,
			query,
			search_depth: "advanced",
			include_answer: false,
			include_images: false,
			include_raw_content: false,
			max_results: maxResults,
		}),
	});

	if (!res.ok) {
		throw new Error(`Tavily request failed (${res.status})`);
	}

	const payload = await res.json() as TavilyResponse;
	const rows = payload.results ?? [];

	return rows
		.filter((r) => !!r.title && !!r.url)
		.map((r) => ({
			title: r.title ?? "",
			url: r.url ?? "",
			content: (r.content ?? "").replace(/\s+/g, " ").trim(),
			score: r.score,
		}));
};

export const researchTopic = (
	topic: string,
	maxResults = 5,
): Promise<ResearchSource[]> => {
	const query = `${topic} release notes updates changelog developer tooling`;
	return searchOnlineSources(query, maxResults);
};

export const tavilyResearchTool = new DynamicStructuredTool({
	name: "search_online_sources",
	description:
		"Searches the web for developer-focused sources for a given topic or query and returns concise source snippets.",
	schema: z.object({
		query: z.string().min(2).describe("Search query or topic name"),
		maxResults: z.number().int().min(1).max(10).optional().default(5),
	}),
	func: async ({ query, maxResults }) => {
		const results = await searchOnlineSources(query, maxResults);
		if (!results.length) return "No online sources found.";
		return JSON.stringify(results, null, 2);
	},
});
