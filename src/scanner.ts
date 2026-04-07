import { connect } from "./db/queries.ts";
import { loadConfig } from "./config.ts";
import { scannerNode } from "./nodes/scanner.node.ts";
import { logger } from "./logger.ts";

const config = loadConfig();

const runScanner = async () => {
  await connect(config.DB_HOST, Number(config.DB_PORT));
  await scannerNode({} as never);
  logger.info("scanner: finished data-driven scan");
};

if (import.meta.main) {
  await runScanner();
}

export default runScanner;
