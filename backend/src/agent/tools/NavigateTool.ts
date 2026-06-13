import { Page } from "playwright";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";

interface NavigateParams extends ToolParams {
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeout?: number;
}

export class NavigateTool extends BaseTool {
  readonly name = "navigate_to_url";
  readonly description = "Direct the browser to a specific URL";

  async execute(params: NavigateParams): Promise<ToolResult> {
    const config = getConfig();
    const startTime = Date.now();

    const url = params.url ?? config.targetUrl;
    const waitUntil = params.waitUntil ?? "networkidle";
    const timeout = params.timeout ?? config.navigationTimeoutMs;

    if (!url) {
      return this.failure("URL is required");
    }

    const page = this.getPage();

    logger.info(`Navigating to URL`, { url, waitUntil, timeout });

    try {
      const response = await page.goto(url, { waitUntil, timeout });

      if (!response) {
        return this.failure(`Navigation failed: no response received for ${url}`);
      }

      if (!response.ok()) {
        logger.warn(`Navigation returned non-OK status`, { status: response.status(), url });
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 5000 });

      logger.info(`Navigation successful`, { url, status: response.status(), durationMs: Date.now() - startTime });
      return this.success({ url, status: response.status() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Navigation failed`, { url, error: message });
      return this.failure(`Navigation failed: ${message}`);
    }
  }
}

toolRegistry.register(new NavigateTool());