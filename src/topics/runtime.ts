import { getAllTopicProfiles } from "../db/queries.ts";
import { logger } from "../logger.ts";
import { allTopics } from "./profiles.ts";
import type { TopicProfile } from "./types.ts";

const normalizeTopicKey = (value: string): string =>
	(value ?? "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const findTopicProfile = (
	profiles: TopicProfile[],
	params: { slug?: string; name?: string },
): TopicProfile | undefined => {
	const slug = (params.slug ?? "").trim();
	const name = (params.name ?? "").trim();

	if (slug.length > 0) {
		const byExactSlug = profiles.find((profile) => profile.slug === slug);
		if (byExactSlug) return byExactSlug;

		const normalizedSlug = normalizeTopicKey(slug);
		if (normalizedSlug.length > 0) {
			const byNormalizedSlug = profiles.find((profile) =>
				normalizeTopicKey(profile.slug) === normalizedSlug
			);
			if (byNormalizedSlug) return byNormalizedSlug;
		}
	}

	if (name.length > 0) {
		const normalizedName = normalizeTopicKey(name);
		if (normalizedName.length > 0) {
			const byName = profiles.find((profile) =>
				normalizeTopicKey(profile.name) === normalizedName
			);
			if (byName) return byName;
		}
	}

	return undefined;
};

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
