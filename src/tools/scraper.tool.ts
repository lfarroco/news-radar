import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { cheerio } from "../deps.ts";

export type ScrapeResult =
	| { ok: true; content: string }
	| { ok: false; error: string };

export const scrapeUrl = async (url: string): Promise<ScrapeResult> => {
	try {
		const res = await fetch(url);
		const html = await res.text();
		const $ = cheerio.load(html);

		const text = $("h1, h2, h3, h4, h5, p")
			.not("header, nav, navbar, footer")
			.text();

		const cleaned = text.replace(/\n\s*\n/g, "\n").replace(/\s\s+/g, " ");
		return { ok: true, content: cleaned };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
};

export const scraperTool = new DynamicStructuredTool({
	name: "scrape_url",
	description:
		"Scrapes the text content from a URL and returns the extracted text.",
	schema: z.object({
		url: z.string().url().describe("URL to scrape"),
	}),
	func: async ({ url }) => {
		const result = await scrapeUrl(url);
		if (!result.ok) return `Error scraping ${url}: ${result.error}`;
		return result.content.substring(0, 4000);
	},
});
