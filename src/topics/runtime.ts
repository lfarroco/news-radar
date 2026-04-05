import { getAllTopicProfiles } from "../db/queries.ts";
import { logger } from "../logger.ts";
import { allTopics } from "./profiles.ts";
import type { TopicProfile } from "./types.ts";

export const loadRuntimeTopicProfiles = async (): Promise<TopicProfile[]> => {
	try {
		const profiles = await getAllTopicProfiles();
		if (profiles.length > 0) {
			return profiles;
		}

		logger.warn("topics: no profiles in DB, falling back to static defaults");
		return allTopics;
	} catch (err) {
		logger.warn({ err }, "topics: failed loading profiles from DB, using defaults");
		return allTopics;
	}
};
