import { logger } from "../logger.ts";
import {
	addTopicNote,
	getAllTopicProfiles,
	getIgnoredTopicSourceUrls,
	getTopicLastScoutedAt,
	markTopicScoutedNow,
	touchSourceSelector,
} from "../db/queries.ts";
import { searchOnlineSources } from "../tools/tavily.tool.ts";
import { compactText } from "../utils.ts";

const BLOCKED_HOST_PATTERN = /(reddit\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com)/i;

const SOURCE_SCOUT_INTERVAL_HOURS = 0.01;

const isEligibleDiscoveredSource = (url: string, score?: number): boolean => {
	try {
		const parsed = new URL(url);
		if (!["http:", "https:"].includes(parsed.protocol)) return false;
		if (BLOCKED_HOST_PATTERN.test(parsed.hostname)) return false;
		if (typeof score === "number" && score < 0.45) return false;
		return true;
	} catch {
		return false;
	}
};

const SOURCE_TYPES = {
	official_blog: "Official blog / announcement channel",
	documentation: "Official documentation or API reference",
	github_releases: "GitHub releases or changelog",
	security_bulletin: "Security advisories or CVE database",
	rfc_standards: "RFC approval or standards body",
	package_registry: "Package registry (npm, PyPI, crates.io, etc.)",
};

const buildSourceQueries = (
	topicName: string,
): Array<{ type: keyof typeof SOURCE_TYPES; query: string }> => {
	return [
		{ type: "official_blog", query: `${topicName} official blog announcements` },
		{ type: "documentation", query: `${topicName} documentation API reference` },
		{ type: "github_releases", query: `${topicName} github releases changelog` },
		{ type: "security_bulletin", query: `${topicName} security advisory CVE` },
		{ type: "rfc_standards", query: `${topicName} RFC standard proposal` },
		{ type: "package_registry", query: `${topicName} package registry release` },
	];
};

export const sourceScoutNode = async (): Promise<void> => {
	const profiles = await getAllTopicProfiles();

	if (profiles.length === 0) {
		logger.warn("source-scout: no topics found");
		return;
	}

	logger.info({ topicCount: profiles.length }, "source-scout: starting");

	let sourcesFound = 0;
	let sourcesInserted = 0;
	let sourcesUpdated = 0;
	let sourcesSkippedIgnored = 0;
	let topicsProcessed = 0;

	for (const profile of profiles) {
		topicsProcessed++;
		try {
			// Throttle: skip if scouted recently
			const lastScoutedAt = await getTopicLastScoutedAt(profile.slug);
			if (lastScoutedAt) {
				const hoursSince = (Date.now() - lastScoutedAt.getTime()) / 3_600_000;
				if (hoursSince < SOURCE_SCOUT_INTERVAL_HOURS) {
					logger.info(
						{ topic: profile.name, hoursSince: hoursSince.toFixed(1) },
						`source-scout: skipping topic (scouted ${hoursSince.toFixed(1)}h ago, interval ${SOURCE_SCOUT_INTERVAL_HOURS}h)`,
					);
					continue;
				}
			}

			const ignoredSourceUrls = new Set(await getIgnoredTopicSourceUrls(profile.slug));
			const queries = buildSourceQueries(profile.name);
			let topicSourcesFound = 0;
			let topicSourcesInserted = 0;
			let topicSourcesUpdated = 0;
			let topicSourcesSkippedIgnored = 0;

			for (const { type, query } of queries) {
				try {
					const sources = (await searchOnlineSources(query, 3)).filter((source) =>
						isEligibleDiscoveredSource(source.url, source.score)
					);
					topicSourcesFound += sources.length;
					sourcesFound += sources.length;

					logger.info(
						{
							topic: profile.name,
							queryType: type,
							query,
							found: sources.length,
							items: sources.map((source) => ({
								title: compactText(source.title, 120),
								url: source.url,
								score: source.score,
							})),
						},
						"source-scout: query results",
					);

					for (const source of sources) {
						if (ignoredSourceUrls.has(source.url)) {
							topicSourcesSkippedIgnored++;
							sourcesSkippedIgnored++;

							logger.info(
								{
									topic: profile.name,
									queryType: type,
									title: compactText(source.title, 120),
									url: source.url,
								},
								"source-scout: skipped ignored source",
							);
							continue;
						}

						const noteContent = `${SOURCE_TYPES[type]}: ${compactText(source.title, 180)}`;

						const noteResult = await addTopicNote(
							profile.slug,
							type,
							noteContent,
							source.url,
							"source-scout-agent",
						);

						// Register the URL in source_selectors so the scanner can track it
						await touchSourceSelector(source.url, profile.slug);

						if (noteResult.action === "inserted") {
							topicSourcesInserted++;
							sourcesInserted++;
						} else {
							topicSourcesUpdated++;
							sourcesUpdated++;
						}

						logger.info(
							{
								topic: profile.name,
								queryType: type,
								title: compactText(source.title, 120),
								url: source.url,
								action: noteResult.action,
								noteId: noteResult.id,
							},
							"source-scout: source recorded",
						);
					}
				} catch (err) {
					logger.warn(
						{ err, topic: profile.name, queryType: type },
						"source-scout: search failed for query type",
					);
				}
			}

			logger.info(
				{
					topic: profile.name,
					found: topicSourcesFound,
					inserted: topicSourcesInserted,
					updated: topicSourcesUpdated,
					skippedIgnored: topicSourcesSkippedIgnored,
				},
				"source-scout: processed topic",
			);

			await markTopicScoutedNow(profile.slug);
		} catch (err) {
			logger.error({ err, topic: profile.name }, "source-scout: topic processing failed");
		}
	}

	logger.info(
		{ topicsProcessed, sourcesFound, sourcesInserted, sourcesUpdated, sourcesSkippedIgnored },
		"source-scout: completed",
	);
};
