import { Page } from "playwright";
import fs from "fs";
import path from "path";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";

interface ScreenshotParams extends ToolParams {
  name?: string;
  fullPage?: boolean;
  selector?: string;
  savePath?: string;
}

interface ScreenshotResult {
  path: string;
  filename: string;
}

export class ScreenshotTool extends BaseTool {
  readonly name = "take_screenshot";
  readonly description = "Capture the current state of the browser window";

  async execute(params: ScreenshotParams): Promise<ToolResult> {
    const config = getConfig();
    const startTime = Date.now();

    const page = this.getPage();
    const screenshotDir = config.screenshotDir;

    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = params.name ?? "screenshot";
    const filename = `${name}-${timestamp}.png`;
    const savePath = params.savePath ?? path.join(screenshotDir, filename);

    try {
      let buffer: Buffer;

      if (params.selector) {
        const locator = page.locator(params.selector).first();
        await locator.waitFor({ state: "visible", timeout: 5000 });
        buffer = await locator.screenshot({ path: savePath });
        logger.info(`Element screenshot captured`, { selector: params.selector, path: savePath });
      } else {
        buffer = await page.screenshot({ path: savePath, fullPage: params.fullPage ?? true });
        logger.info(`Page screenshot captured`, { fullPage: params.fullPage ?? true, path: savePath });
      }

      const result: ScreenshotResult = { path: savePath, filename };
      logger.info(`Screenshot saved`, { filename, sizeBytes: buffer.length, durationMs: Date.now() - startTime });
      return this.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Screenshot failed`, { error: message });
      return this.failure(`Screenshot failed: ${message}`);
    }
  }
}

toolRegistry.register(new ScreenshotTool());