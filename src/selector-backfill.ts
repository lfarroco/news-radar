import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
import { runCli } from "./cli.ts";
import { logger } from "./logger.ts";
import { selectorBackfillNode } from "./nodes/selector-backfill.node.ts";

export type SelectorBackfillCliOptions = {
	limit: number;
	topicSlug?: string;
};

const readFlagValue = (args: string[], index: number, flag: string): string => {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
};

export const parseSelectorBackfillArgs = (
	args: string[],
): SelectorBackfillCliOptions => {
	let limit = 100;
	let topicSlug: string | undefined;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];

		if (arg === "--limit") {
			const raw = readFlagValue(args, index, "--limit");
			const parsed = Number.parseInt(raw, 10);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw new Error(`Invalid --limit value: ${raw}`);
			}
			limit = parsed;
			index++;
			continue;
		}

		if (arg.startsWith("--limit=")) {
			const raw = arg.slice("--limit=".length);
			const parsed = Number.parseInt(raw, 10);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw new Error(`Invalid --limit value: ${raw}`);
			}
			limit = parsed;
			continue;
		}

		if (arg === "--topic") {
			topicSlug = readFlagValue(args, index, "--topic").trim();
			if (!topicSlug) throw new Error("Invalid --topic value");
			index++;
			continue;
		}

		if (arg.startsWith("--topic=")) {
			topicSlug = arg.slice("--topic=".length).trim();
			if (!topicSlug) throw new Error("Invalid --topic value");
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return { limit, topicSlug };
};

export const runSelectorBackfill = async (
	args = Deno.args,
): Promise<void> => {
	const options = parseSelectorBackfillArgs(args);
	const config = loadConfig();

	await connect(config.DB_HOST, Number(config.DB_PORT));

	logger.info(options, "selector-backfill: starting backfill agent");
	await selectorBackfillNode(options);
	logger.info("selector-backfill: finished");
};

if (import.meta.main) {
	const code = await runCli(
		() => runSelectorBackfill(),
		(err) => logger.error({ err }, "selector-backfill: process exiting with failure"),
	);
	if (code !== 0) {
		Deno.exit(code);
	}
}