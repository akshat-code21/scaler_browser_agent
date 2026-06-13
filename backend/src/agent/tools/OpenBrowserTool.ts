/** Launches a Playwright browser instance with configurable channel (chromium/firefox/webkit) and viewport. */
import { Browser, BrowserContext, chromium, firefox, webkit } from "playwright";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";

interface OpenBrowserParams extends ToolParams {
  headless?: boolean;
  channel?: "chromium" | "firefox" | "webkit";
  viewportWidth?: number;
  viewportHeight?: number;
}

interface OpenBrowserResult {
  browser: Browser;
  context: BrowserContext;
}

export class OpenBrowserTool extends BaseTool {
  readonly name = "open_browser";
  readonly description = "Initialize and launch a browser instance";

  async execute(params: OpenBrowserParams): Promise<ToolResult> {
    const config = getConfig();
    const startTime = Date.now();

    const headless = params.headless ?? config.headless;
    const channel = (params.channel ?? config.browserChannel) as "chromium" | "firefox" | "webkit";
    const viewportWidth = params.viewportWidth ?? config.viewportWidth;
    const viewportHeight = params.viewportHeight ?? config.viewportHeight;

    logger.info(`Opening browser`, { channel, headless, viewport: `${viewportWidth}x${viewportHeight}` });

    let browser: Browser;

    try {
      switch (channel) {
        case "chromium":
          browser = await chromium.launch({ headless });
          break;
        case "firefox":
          browser = await firefox.launch({ headless });
          break;
        case "webkit":
          browser = await webkit.launch({ headless });
          break;
        default:
          throw new Error(`Unsupported browser channel: ${channel}`);
      }

      const context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
      });

      this.setContext({ browser, context });

      logger.info(`Browser opened successfully`, { durationMs: Date.now() - startTime });
      return this.success({ browser, context } as unknown as OpenBrowserResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to open browser`, { error: message });
      return this.failure(`Failed to open browser: ${message}`);
    }
  }
}

toolRegistry.register(new OpenBrowserTool());
