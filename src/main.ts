import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
const config = loadConfig();
import { buildGraph } from "./graph/index.ts";
import { logger } from "./logger.ts";

await connect(config.DB_HOST, Number(config.DB_PORT));

logger.info("pipeline: starting");

const graph = buildGraph();
const result = await graph.invoke({});

if (result.errors?.length) {
	logger.error({ errors: result.errors }, "pipeline: completed with errors");
} else {
	logger.info("pipeline: completed successfully");
}
