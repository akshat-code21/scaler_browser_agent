import { Page, Locator } from "playwright";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";
import { ElementDetector } from "../../utils/element-detector.js";

interface ClickParams extends ToolParams {
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  role?: string;
  name?: string;
  testId?: string;
  force?: boolean;
  timeout?: number;
}

export class ClickTool extends BaseTool {
  readonly name = "click_on_screen";
  readonly description = "Perform mouse clicks at specified coordinates or on elements";

  private elementDetector = new ElementDetector();

  async execute(params: ClickParams): Promise<ToolResult> {
    const config = getConfig();
    const startTime = Date.now();
    const timeout = params.timeout ?? config.actionTimeoutMs;

    const page = this.getPage();

    let locator: Locator | null = null;
    let strategy = "";

    try {
      if (params.selector) {
        strategy = "selector";
        locator = page.locator(params.selector).first();
      } else if (params.x !== undefined && params.y !== undefined) {
        strategy = "coordinates";
        logger.info(`Clicking at coordinates`, { x: params.x, y: params.y });
        await page.mouse.click(params.x, params.y);
        return this.success({ x: params.x, y: params.y, strategy });
      } else if (params.text) {
        strategy = "text";
        locator = page.getByText(params.text, { exact: false }).first();
      } else if (params.role && params.name) {
        strategy = "role+name";
        locator = page.getByRole(params.role as any, { name: params.name }).first();
      } else if (params.role) {
        strategy = "role";
        locator = page.getByRole(params.role as any).first();
      } else if (params.testId) {
        strategy = "testId";
        locator = page.getByTestId(params.testId).first();
      } else if (params.name) {
        strategy = "name";
        locator = page.getByLabel(params.name).first();
      } else {
        return this.failure("No valid click target specified. Provide selector, coordinates, text, role, testId, or name.");
      }

      if (locator) {
        logger.info(`Clicking element`, { strategy, force: params.force });
        await locator.waitFor({ state: "visible", timeout });
        await locator.click({ force: params.force, timeout });
      }

      const inputTag = await locator?.evaluate((el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || el.getAttribute("contenteditable")) {
          return tag;
        }
        return null;
      }).catch(() => null);

      const hint = inputTag ? `You clicked on a ${inputTag} field. Now use the send_keys tool to type text into it.` : undefined;

      logger.info(`Click successful`, { strategy, durationMs: Date.now() - startTime });
      return this.success({ strategy, hint });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Click failed`, { strategy, error: message });
      return this.failure(`Click failed: ${message}`);
    }
  }
}

toolRegistry.register(new ClickTool());