import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { parseFeed } from "../deps.ts";
import {
	insertCandidate,
	upsertTopic,
} from "../db/queries.ts";
import { slugify } from "../utils.ts";
import { loadConfig } from "../config.ts";

const { MAX_AGE_DAYS } = loadConfig();

const RESTRICTED_DOMAINS = [
	"youtube.com",
	"youtu.be",
	"instagram.com",
	"facebook.com",
	"tiktok.com",
	"v.redd.it",
	"vimeo.com",
	"gfycat.com",
	"streamable.com",
	"news.ycombinator",
	"reddit.com",
	"redd.it",
	"i.redd.it",
];

const isRestricted = (url: string) =>
	RESTRICTED_DOMAINS.some((d) => url.includes(d));

const isRecent = (date: Date) =>
	Date.now() - date.getTime() < 1000 * 60 * 60 * 24 * MAX_AGE_DAYS;

// ── RSS tool ─────────────────────────────────────────────────────────────────

export const rssTool = new DynamicStructuredTool({
	name: "fetch_rss",
	description:
		"Fetches an RSS/Atom feed and inserts new articles into the database.",
	schema: z.object({
		url: z.string().url().describe("Feed URL"),
		topics: z
			.array(z.string())
			.describe("Topic labels associated with this feed, e.g. ['Rust']"),
		hasContent: z
			.boolean()
			.optional()
			.default(false)
			.describe("Whether the feed includes full article content"),
	}),
	func: async ({ url, topics, hasContent }) => {
		let xml: string;

		try {
			const res = await fetch(url);
			xml = await res.text();
		} catch (err) {
			return `Error fetching ${url}: ${err}`;
		}

		const feed = await parseFeed(xml);
		let inserted = 0;

		await Promise.all(
			feed.entries.map(async (item) => {
				const rawTitle = (item.title as { value?: string })?.value ?? "";
				const title = rawTitle.trim();
				const link: string =
					(item.links as Array<{ href: string }>)?.[0]?.href ?? "";
				const pub = (item.published ?? item.updated) as Date | undefined;
				const date = pub ? new Date(pub) : new Date();
				const description =
					(item.content as { value?: string })?.value ?? null;

				if (!title || !link || isRestricted(link) || !isRecent(date)) return;

				const snippet = hasContent && description ? description : "";

				if (topics.length === 0) {
					const fallbackSlug = "general";
					await upsertTopic("General", fallbackSlug);
					await insertCandidate(
						title,
						link,
						snippet,
						url,
						date,
						fallbackSlug,
						"General",
					);
				} else {
					await Promise.all(
						topics.map(async (topic) => {
							const topicSlug = slugify(topic);
							await upsertTopic(topic, topicSlug);
							await insertCandidate(
								title,
								link,
								snippet,
								url,
								date,
								topicSlug,
								topic,
							);
						}),
					);
				}

				inserted++;
			}),
		);

		return `Inserted ${inserted} items from ${url}`;
	},
});
