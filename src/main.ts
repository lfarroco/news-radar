import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
const config = loadConfig();
import { buildGraph } from "./graph/index.ts";
import { logger } from "./logger.ts";
import { ensureTopicsSeeded } from "./topics/seed.ts";
import { runPipelineWithDeps } from "./pipeline/runner.ts";

export const runPipeline = async () => {
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
	await runPipeline();
}
