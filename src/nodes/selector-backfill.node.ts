import {
	getSourceSelectorsNeedingBackfill,
} from "../db/queries.ts";
import { logger } from "../logger.ts";
import { findTopicProfile, loadRuntimeTopicProfiles } from "../topics/runtime.ts";
import { learnAndCrawlSource } from "./selector-learner.node.ts";

export type SelectorBackfillOptions = {
	limit?: number;
	topicSlug?: string;
};

export type SelectorBackfillSummary = {
	processed: number;
	learned: number;
	unresolved: number;
	limit: number;
	topicSlug: string | null;
};

export const selectorBackfillNode = async (
	options: SelectorBackfillOptions = {},
): Promise<SelectorBackfillSummary> => {
	const limit = options.limit ?? 100;
	const topicSlug = options.topicSlug ?? null;
	const pendingRows = await getSourceSelectorsNeedingBackfill(limit, topicSlug ?? undefined);

	if (pendingRows.length === 0) {
		const summary = {
			processed: 0,
			learned: 0,
			unresolved: 0,
			limit,
			topicSlug,
		};
		logger.info(summary, "selector-backfill: no rows need backfill");
		return summary;
	}

	const topicProfiles = await loadRuntimeTopicProfiles();
	let learned = 0;
	let unresolved = 0;

	for (const [index, row] of pendingRows.entries()) {
		const topicProfile = findTopicProfile(topicProfiles, { slug: row.topic_slug });
		const topicName = topicProfile?.name ?? row.topic_slug;

		logger.info(
			{
				index: index + 1,
				total: pendingRows.length,
				topic: row.topic_slug,
				sourceUrl: row.source_url,
			},
			"selector-backfill: learning selectors for source",
		);

		const result = await learnAndCrawlSource(row.source_url, row.topic_slug, topicName);
		if (result) {
			learned++;
			continue;
		}

		unresolved++;
	}

	const summary = {
		processed: pendingRows.length,
		learned,
		unresolved,
		limit,
		topicSlug,
	};

	logger.info(summary, "selector-backfill: completed");
	return summary;
};