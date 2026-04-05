import { logger } from "../logger.ts";
import { addTopicNote, getAllTopicProfiles } from "../db/queries.ts";
import { searchOnlineSources } from "../tools/tavily.tool.ts";
import { compactText } from "../utils.ts";

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

	let sourcesAdded = 0;
	let topicsProcessed = 0;

	for (const profile of profiles) {
		topicsProcessed++;
		try {
			const queries = buildSourceQueries(profile.name);

			for (const { type, query } of queries) {
				try {
					const sources = await searchOnlineSources(query, 3);

					for (const source of sources) {
						const summary = compactText(source.content, 220);
						const noteContent = [
							`Type: ${SOURCE_TYPES[type]}`,
							`Title: ${source.title}`,
							`Fact: ${summary || "Potentially relevant source discovered."}`,
						].join("\n");

						await addTopicNote(
							profile.slug,
							type,
							noteContent,
							source.url,
							"source-scout-agent",
						);

						sourcesAdded++;
					}
				} catch (err) {
					logger.debug(
						{ err, topic: profile.name, queryType: type },
						"source-scout: search failed for query type",
					);
				}
			}

			logger.info(
				{ topic: profile.name, added: sourcesAdded },
				"source-scout: processed topic",
			);
		} catch (err) {
			logger.error({ err, topic: profile.name }, "source-scout: topic processing failed");
		}
	}

	logger.info(
		{ topicsProcessed, sourcesAdded },
		"source-scout: completed",
	);
};
