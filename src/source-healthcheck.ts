import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
import { runCli } from "./cli.ts";
import { logger } from "./logger.ts";
import { sourceHealthcheckNode } from "./nodes/source-healthcheck.node.ts";

const parseArgs = (args: string[]) => {
	let limit = 200;
	let topicSlug: string | undefined;
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("--limit=")) {
			limit = Number(arg.split("=")[1]);
		} else if (arg === "--limit" && args[i + 1]) {
			limit = Number(args[++i]);
		} else if (arg.startsWith("--topic=")) {
			topicSlug = arg.split("=")[1];
		} else if (arg === "--topic" && args[i + 1]) {
			topicSlug = args[++i];
		} else if (arg === "--dry-run") {
			dryRun = true;
		}
	}

	return { limit, topicSlug, dryRun };
};

export const runSourceHealthcheck = async (
	args = Deno.args,
): Promise<void> => {
	const options = parseArgs(args);
	const config = loadConfig();

	await connect(config.DB_HOST, Number(config.DB_PORT));

	logger.info(options, "source-healthcheck: starting");
	const summary = await sourceHealthcheckNode(options);

	if (summary.dead > 0) {
		logger.warn(
			{ dead: summary.dead },
			`source-healthcheck: ${summary.dead} dead source(s) removed`,
		);
	}
	if (summary.relearned > 0) {
		logger.info(
			{ relearned: summary.relearned },
			`source-healthcheck: ${summary.relearned} source(s) had selectors relearned`,
		);
	}

	logger.info("source-healthcheck: finished");
};

if (import.meta.main) {
	const code = await runCli(
		() => runSourceHealthcheck(),
		(err) => logger.error({ err }, "source-healthcheck: process exiting with failure"),
	);
	if (code !== 0) {
		Deno.exit(code);
	}
}
