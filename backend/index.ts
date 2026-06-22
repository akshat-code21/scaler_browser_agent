import "./src/agent/index.js";
import { AIAgent } from "./src/agent/AIAgent.js";
import { logger } from "./src/utils/logger.js";

async function main() {
  const agent = new AIAgent();
  const prompt = process.argv.slice(2).join(" ").trim() || undefined;
  const result = await agent.run(prompt);

  if (result.success) {
    logger.info("Task completed successfully", {
      steps: result.steps,
      durationMs: result.durationMs,
      screenshots: result.screenshotPaths.length,
      tokens: result.tokenUsage,
      summary: result.llmSummary,
    });
    process.exit(0);
  } else {
    logger.error("Task failed", {
      error: result.error,
      steps: result.steps,
      durationMs: result.durationMs,
    });
    process.exit(1);
  }
}

main();
