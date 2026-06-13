import { Page, Locator } from "playwright";
import { BaseTool, ToolParams, ToolResult, toolRegistry } from "./Tool.js";
import { getConfig } from "../../utils/config.js";
import { logger } from "../../utils/logger.js";
import { ElementDetector } from "../../utils/element-detector.js";

interface SendKeysParams extends ToolParams {
  text: string;
  selector?: string;
  testId?: string;
  name?: string;
  placeholder?: string;
  role?: string;
  clearFirst?: boolean;
  delay?: number;
  timeout?: number;
}

export class SendKeysTool extends BaseTool {
  readonly name = "send_keys";
  readonly description = "Input text into form fields or text areas";

  private elementDetector = new ElementDetector();

  async execute(params: SendKeysParams): Promise<ToolResult> {
    const config = getConfig();
    const startTime = Date.now();
    const timeout = params.timeout ?? config.elementTimeoutMs;

    const { text, clearFirst = true, delay = 0 } = params;

    if (!text) {
      return this.failure("Text is required");
    }

    const page = this.getPage();

    let locator: Locator | null = null;
    let strategy = "";

    try {
      if (params.selector) {
        strategy = "selector";
        locator = page.locator(params.selector).first();
      } else if (params.testId) {
        strategy = "testId";
        locator = page.getByTestId(params.testId).first();
      } else if (params.name) {
        strategy = "name";
        locator = page.getByLabel(params.name).first();
      } else if (params.placeholder) {
        strategy = "placeholder";
        locator = page.locator(`[placeholder="${params.placeholder}"]`).first();
      } else if (params.role) {
        strategy = "role";
        locator = page.getByRole(params.role as any).first();
      } else {
        return this.failure("No valid target specified. Provide selector, testId, name, placeholder, or role.");
      }

      logger.info(`Typing into element`, { strategy, textLength: text.length, clearFirst });

      await locator.waitFor({ state: "visible", timeout });

      if (clearFirst) {
        await locator.clear();
      }

      if (delay > 0) {
        await locator.type(text, { delay });
      } else {
        await locator.fill(text);
      }

      const value = await locator.inputValue();
      logger.info(`Send keys successful`, { strategy, valueLength: value.length, durationMs: Date.now() - startTime });
      return this.success({ strategy, value });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Send keys failed`, { strategy, error: message });
      return this.failure(`Send keys failed: ${message}`);
    }
  }
}

toolRegistry.register(new SendKeysTool());