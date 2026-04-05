import { logger } from "../logger.ts";
import { researchTopic, type ResearchSource } from "../tools/tavily.tool.ts";
import type { PipelineState } from "../graph/state.ts";

const MAX_TOPICS_PER_RUN = 8;
const MAX_RESULTS_PER_TOPIC = 4;
const CONCURRENCY = 3;

const parseTopicsField = (raw: string | undefined): string[] => {
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed
				.filter((v): v is string => typeof v === "string")
				.map((v) => v.trim())
				.filter(Boolean);
		}
	} catch {
		// Ignore malformed topics JSON.
	}

	return [];
};

const parseTopicsFromTitle = (title: string): string[] => {
	const [prefix] = title.split(" - ", 1);
	if (!prefix || !title.includes(" - ")) return [];

	return prefix
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
};

const collectTopics = (state: PipelineState): string[] => {
	const topics = new Set<string>();

	for (const article of state.pendingArticles) {
		for (const topic of parseTopicsField(article.topics)) topics.add(topic);
		for (const topic of parseTopicsFromTitle(article.title)) topics.add(topic);
	}

	return [...topics].slice(0, MAX_TOPICS_PER_RUN);
};

const runConcurrent = async <T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> => {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		const slice = items.slice(i, i + concurrency);
		const batch = await Promise.all(slice.map(fn));
		results.push(...batch);
	}
	return results;
};

export const researcherNode = async (
	state: PipelineState,
): Promise<Partial<PipelineState>> => {
	const topics = collectTopics(state);
	if (topics.length === 0) {
		logger.info("researcher: no topics detected, skipping");
		return {};
	}

	logger.info({ topics: topics.length }, "researcher: starting");

	const rows = await runConcurrent(topics, CONCURRENCY, async (topic) => {
		try {
			const sources = await researchTopic(topic, MAX_RESULTS_PER_TOPIC);
			return { topic, sources };
		} catch (err) {
			logger.warn({ err, topic }, "researcher: topic search failed");
			return { topic, sources: [] as ResearchSource[] };
		}
	});

	const topicResearch: Record<string, ResearchSource[]> = {};
	for (const { topic, sources } of rows) {
		topicResearch[topic.toLowerCase()] = sources;
	}

	logger.info(
		{ researchedTopics: Object.keys(topicResearch).length },
		"researcher: finished",
	);

	return { topicResearch };
};
