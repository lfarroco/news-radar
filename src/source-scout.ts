import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { sourceScoutNode } from "./nodes/source-scout.node.ts";

const config = loadConfig();

await connect(config.DB_HOST, Number(config.DB_PORT));

logger.info("source-scout: starting source discovery agent");

await sourceScoutNode();

logger.info("source-scout: completed");

Deno.exit(0);
