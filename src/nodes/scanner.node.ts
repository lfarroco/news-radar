import { logger } from "../logger.ts";
import { loadRuntimeTopicProfiles } from "../topics/runtime.ts";
import { rssTool } from "../tools/rss.tool.ts";
import { redditTool } from "../tools/reddit.tool.ts";
import {
	getPendingCandidates,
	markTopicCrawledNow,
} from "../db/queries.ts";
import type { PipelineState } from "../graph/state.ts";

export const scannerNode = async (
	_state: PipelineState,
): Promise<Partial<PipelineState>> => {
	logger.info("scanner: starting");
	const topics = await loadRuntimeTopicProfiles();

	const tasks: Promise<string>[] = [];

	for (const topic of topics) {
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

		await markTopicCrawledNow(topic.slug);
	}

	const results = await Promise.allSettled(tasks);
	results.forEach((r) => {
		if (r.status === "rejected") logger.warn({ err: r.reason }, "scanner task failed");
		else logger.debug(r.value);
	});

	const pendingCandidates = await getPendingCandidates();
	logger.info({ count: pendingCandidates.length }, "scanner: finished");

	return {
		pendingCandidates,
		metrics: {
			scanned: pendingCandidates.length,
			reviewed: 0,
			tasksCreated: 0,
			written: 0,
		},
	};
};
