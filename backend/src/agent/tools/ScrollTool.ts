import { Page, Locator } from "playwright";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";

interface ScrollParams extends ToolParams {
  x?: number;
  y?: number;
  direction?: "up" | "down" | "left" | "right";
  pixels?: number;
  selector?: string;
  behavior?: "auto" | "smooth" | "instant";
  timeout?: number;
}

export class ScrollTool extends BaseTool {
  readonly name = "scroll";
  readonly description = "Scroll the page to reveal hidden elements";

  async execute(params: ScrollParams): Promise<ToolResult> {
    const config = getConfig();
    const startTime = Date.now();
    const timeout = params.timeout ?? config.actionTimeoutMs;

    const page = this.getPage();

    try {
      if (params.selector) {
        const locator = page.locator(params.selector).first();
        await locator.waitFor({ state: "attached", timeout });
        await locator.scrollIntoViewIfNeeded({ timeout });
        logger.info(`Scrolled element into view`, { selector: params.selector, durationMs: Date.now() - startTime });
        return this.success({ selector: params.selector, action: "scrollIntoView" });
      }

      const { x = 0, y = 0, direction, pixels = 300, behavior = "smooth" } = params;

      let scrollX = x;
      let scrollY = y;

      if (direction) {
        switch (direction) {
          case "up":
            scrollY = -pixels;
            break;
          case "down":
            scrollY = pixels;
            break;
          case "left":
            scrollX = -pixels;
            break;
          case "right":
            scrollX = pixels;
            break;
        }
      }

      logger.info(`Scrolling page`, { scrollX, scrollY, behavior });

      await page.evaluate(
        ({ x, y, behavior }) => {
          window.scrollBy({ left: x, top: y, behavior });
        },
        { x: scrollX, y: scrollY, behavior }
      );

      await page.waitForTimeout(300);

      logger.info(`Scroll successful`, { scrollX, scrollY, durationMs: Date.now() - startTime });
      return this.success({ scrollX, scrollY });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Scroll failed`, { error: message });
      return this.failure(`Scroll failed: ${message}`);
    }
  }
}

toolRegistry.register(new ScrollTool());