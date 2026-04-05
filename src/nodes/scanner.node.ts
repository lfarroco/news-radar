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
	const startedAt = Date.now();
	logger.info("scanner: starting");
	const topics = await loadRuntimeTopicProfiles();

	if (topics.length === 0) {
		logger.warn("scanner: no topics configured, skipping source discovery");
		return {
			pendingCandidates: [],
			metrics: {
				scanned: 0,
				reviewed: 0,
				tasksCreated: 0,
				written: 0,
			},
		};
	}

	const tasks: Promise<string>[] = [];
	let rssTaskCount = 0;
	let redditTaskCount = 0;

	for (const topic of topics) {
		logger.info(
			{
				topic: topic.slug,
				rssFeeds: topic.rssFeedUrls.length,
				redditSubs: topic.redditSubreddits.length,
			},
			"scanner: scheduling topic sources",
		);

		for (const feedUrl of topic.rssFeedUrls) {
			rssTaskCount++;
			tasks.push(
				rssTool.invoke({ url: feedUrl, topics: [topic.name], hasContent: true })
					.catch((err) => `rss error ${feedUrl}: ${err}`),
			);
		}

		for (const sub of topic.redditSubreddits) {
			redditTaskCount++;
			tasks.push(
				redditTool.invoke({ subreddit: sub, topic: topic.name })
					.catch((err) => `reddit error r/${sub}: ${err}`),
			);
		}

		await markTopicCrawledNow(topic.slug);
	}

	logger.info(
		{ topicCount: topics.length, rssTaskCount, redditTaskCount, totalTasks: tasks.length },
		"scanner: running source tasks",
	);

	const results = await Promise.allSettled(tasks);
	let fulfilled = 0;
	let rejected = 0;
	results.forEach((r) => {
		if (r.status === "rejected") {
			rejected++;
			logger.warn({ err: r.reason }, "scanner task failed");
		} else {
			fulfilled++;
			logger.debug(r.value);
		}
	});

	const pendingCandidates = await getPendingCandidates();
	logger.info(
		{
			count: pendingCandidates.length,
			fulfilled,
			rejected,
			durationMs: Date.now() - startedAt,
		},
		"scanner: finished",
	);

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
