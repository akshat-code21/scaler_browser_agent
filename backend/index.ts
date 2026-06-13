import "./src/agent/index.js";
import { Agent } from "./src/agent/Agent.js";
import { logger } from "./src/utils/logger.js";

async function main() {
  const agent = new Agent();
  const result = await agent.run();

  if (result.success) {
    logger.info("Task completed successfully", {
      durationMs: result.durationMs,
      screenshots: result.screenshotPaths,
    });
    process.exit(0);
  } else {
    logger.error("Task failed", {
      error: result.error,
      durationMs: result.durationMs,
    });
    process.exit(1);
  }
}

main();
