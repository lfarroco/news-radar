import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
import { runCli } from "./cli.ts";
import { logger } from "./logger.ts";
import { selectorBackfillNode } from "./nodes/selector-backfill.node.ts";
import { parseSelectorBackfillArgs } from "./selector-backfill.args.ts";

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