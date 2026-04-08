import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
import { buildGraph } from "./graph/index.ts";
import { logger } from "./logger.ts";
import { ensureTopicsSeeded } from "./topics/seed.ts";
import { runPipelineWithDeps } from "./pipeline/runner.ts";
import { runCli } from "./cli.ts";

export const runPipeline = async () => {
	const config = loadConfig();
	const runId = crypto.randomUUID().slice(0, 8);
	const runLogger = logger.child({ runId });
	const startedAt = Date.now();
	runLogger.info({ dbHost: config.DB_HOST, dbPort: Number(config.DB_PORT) }, "pipeline: connecting");

	await runPipelineWithDeps({
		runLogger,
		startedAt,
		connect: () => connect(config.DB_HOST, Number(config.DB_PORT)),
		ensureTopicsSeeded,
		buildGraph,
	});
};

if (import.meta.main) {
	const code = await runCli(
		runPipeline,
		(err) => logger.error({ err }, "pipeline: process exiting with failure"),
	);
	if (code !== 0) {
		Deno.exit(code);
	}
}
