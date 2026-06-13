import { Page, Locator } from "playwright";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";

interface DoubleClickParams extends ToolParams {
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

export class DoubleClickTool extends BaseTool {
  readonly name = "double_click";
  readonly description = "Perform double-click actions when necessary";

  async execute(params: DoubleClickParams): Promise<ToolResult> {
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
        logger.info(`Double-clicking at coordinates`, { x: params.x, y: params.y });
        await page.mouse.dblclick(params.x, params.y);
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
        return this.failure("No valid double-click target specified. Provide selector, coordinates, text, role, testId, or name.");
      }

      if (locator) {
        logger.info(`Double-clicking element`, { strategy, force: params.force });
        await locator.waitFor({ state: "visible", timeout });
        await locator.dblclick({ force: params.force, timeout });
      }

      logger.info(`Double-click successful`, { strategy, durationMs: Date.now() - startTime });
      return this.success({ strategy });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Double-click failed`, { strategy, error: message });
      return this.failure(`Double-click failed: ${message}`);
    }
  }
}

toolRegistry.register(new DoubleClickTool());