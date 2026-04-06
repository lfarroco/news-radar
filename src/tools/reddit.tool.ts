import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { cheerio } from "../deps.ts";
import {
	insertCandidate,
	upsertTopic,
} from "../db/queries.ts";
import { slugify } from "../utils.ts";

const RESTRICTED_DOMAINS = [
	"youtube.com",
	"youtu.be",
	"twitter.com",
	"instagram.com",
	"facebook.com",
	"tiktok.com",
	"v.redd.it",
	"vimeo.com",
	"gfycat.com",
	"streamable.com",
	"reddit.com",
	"redd.it",
	"/r/",
];

const MAX_AGE_DAYS = 3;

const isRestricted = (url: string) =>
	RESTRICTED_DOMAINS.some((d) => url.includes(d));

const isRecent = (date: Date) =>
	(Date.now() - date.getTime()) / 1000 / 60 / 60 / 24 < MAX_AGE_DAYS;

// ── Reddit tool ─────────────────────────────────────────────────────────────

export const redditTool = new DynamicStructuredTool({
	name: "fetch_reddit",
	description:
		"Fetches top posts from a subreddit for the past week and inserts relevant ones into the database.",
	schema: z.object({
		subreddit: z.string().describe("Subreddit name without r/"),
		topic: z.string().describe("Topic label for this subreddit, e.g. 'Rust'"),
	}),
	func: async ({ subreddit, topic }) => {
		const url = `https://old.reddit.com/r/${subreddit}/top/?sort=top&t=week`;
		let html: string;

		try {
			const res = await fetch(url);
			html = await res.text();
		} catch (err) {
			return `Error fetching r/${subreddit}: ${err}`;
		}

		const $ = cheerio.load(html);
		const entries = $(".thing:not(.promoted)").toArray();
		let inserted = 0;

		await Promise.all(
			entries.map(async (entry: unknown) => {
				const elem = $(entry as Parameters<typeof $>[0]);
				const title = elem.find("a.title.outbound").text().trim();
				const link = elem.find(".title a").attr("href") ?? "";
				const published = elem.find(".tagline time").attr("datetime") ?? "";
				const date = new Date(published);

				if (!link || isRestricted(link) || !isRecent(date)) return;

				const topicSlug = slugify(topic);
				await upsertTopic(topic, topicSlug);
				await insertCandidate(
					title,
					link,
					"",
					`reddit-${subreddit}`,
					date,
					topicSlug,
					topic,
				);
				inserted++;
			}),
		);

		return `Inserted ${inserted} items from r/${subreddit}`;
	},
});
