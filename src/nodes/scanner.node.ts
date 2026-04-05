import { logger } from "../logger.ts";
import { allTopics } from "../topics/profiles.ts";
import { rssTool } from "../tools/rss.tool.ts";
import { redditTool } from "../tools/reddit.tool.ts";
import { getPendingArticles } from "../db/queries.ts";
import type { PipelineState } from "../graph/state.ts";

export const scannerNode = async (
	_state: PipelineState,
): Promise<Partial<PipelineState>> => {
	logger.info("scanner: starting");

	const tasks: Promise<string>[] = [];

	for (const topic of allTopics) {
		for (const feedUrl of topic.rssFeedUrls) {
			tasks.push(
				rssTool.invoke({ url: feedUrl, topics: [topic.name], hasContent: true })
					.catch((err) => `rss error ${feedUrl}: ${err}`),
			);
		}

		for (const sub of topic.redditSubreddits) {
			tasks.push(
				redditTool.invoke({ subreddit: sub, topic: topic.name })
					.catch((err) => `reddit error r/${sub}: ${err}`),
			);
		}
	}

	const results = await Promise.allSettled(tasks);
	results.forEach((r) => {
		if (r.status === "rejected") logger.warn({ err: r.reason }, "scanner task failed");
		else logger.debug(r.value);
	});

	const pendingArticles = await getPendingArticles();
	logger.info({ count: pendingArticles.length }, "scanner: finished");

	return { pendingArticles };
};
