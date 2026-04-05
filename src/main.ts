import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
const config = loadConfig();
import { buildGraph } from "./graph/index.ts";
import { logger } from "./logger.ts";
import { ensureTopicsSeeded } from "./topics/seed.ts";

const runId = crypto.randomUUID().slice(0, 8);
const runLogger = logger.child({ runId });
const startedAt = Date.now();

try {
	runLogger.info({ dbHost: config.DB_HOST, dbPort: Number(config.DB_PORT) }, "pipeline: connecting");
	await connect(config.DB_HOST, Number(config.DB_PORT));
	await ensureTopicsSeeded();

	runLogger.info("pipeline: starting graph");
	const graph = buildGraph();
	const result = await graph.invoke({});

	const summary = {
		durationMs: Date.now() - startedAt,
		errorCount: result.errors?.length ?? 0,
		publishedCount: result.publishedArticles?.length ?? 0,
		metrics: result.metrics,
	};

	if (result.errors?.length) {
		runLogger.error({ ...summary, errors: result.errors }, "pipeline: completed with errors");
	} else {
		runLogger.info(summary, "pipeline: completed successfully");
	}
} catch (err) {
	runLogger.error({ err, durationMs: Date.now() - startedAt }, "pipeline: crashed");
	throw err;
}
