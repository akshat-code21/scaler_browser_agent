import { toolRegistry } from "./tools/Tool.js";
import { ElementDetector } from "../utils/element-detector.js";
import { getConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { Page, Browser, BrowserContext } from "playwright";

export interface AgentResult {
  success: boolean;
  screenshotPaths: string[];
  error?: string;
  durationMs: number;
}

export class Agent {
  private detector: ElementDetector;
  private page: Page | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private startTime: number = 0;

  constructor() {
    this.detector = new ElementDetector();
  }

  async run(): Promise<AgentResult> {
    this.startTime = Date.now();
    const config = getConfig();
    const screenshotPaths: string[] = [];

    logger.info("Agent started", { targetUrl: config.targetUrl });

    try {
      await this.openBrowser();
      const page = await this.createPage();
      this.page = page;

      await this.navigate(config.targetUrl);

      const initialScreenshot = await this.takeScreenshot("page-loaded");
      if (initialScreenshot) screenshotPaths.push(initialScreenshot);

      await this.scrollToForm();

      const fieldsFilled = await this.fillFormFields(config);
      if (!fieldsFilled) {
        return this.failure("Could not find and fill form fields", screenshotPaths);
      }

      const finalScreenshot = await this.takeScreenshot("form-filled");
      if (finalScreenshot) screenshotPaths.push(finalScreenshot);

      const durationMs = Date.now() - this.startTime;
      logger.info("Agent completed successfully", { durationMs, screenshotPaths });
      return { success: true, screenshotPaths, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Agent failed", { error: message });

      if (config.screenshotOnFailure && this.page) {
        const failScreenshot = await this.takeScreenshot("failure").catch(() => null);
        if (failScreenshot) screenshotPaths.push(failScreenshot);
      }

      return this.failure(message, screenshotPaths);
    } finally {
      await this.cleanup();
    }
  }

  private async openBrowser(): Promise<void> {
    const openBrowserTool = toolRegistry.get("open_browser");
    if (!openBrowserTool) throw new Error("open_browser tool not registered");

    const result = await openBrowserTool.execute({});
    if (!result.success) throw new Error(`Failed to open browser: ${result.error}`);

    const data = result.data as { browser: Browser; context: BrowserContext };
    this.browser = data.browser;
    this.context = data.context;
  }

  private async createPage(): Promise<Page> {
    if (!this.context) throw new Error("Browser context not initialized");
    const page = await this.context.newPage();

    toolRegistry.setContextForAll({ browser: this.browser!, context: this.context!, page });
    return page;
  }

  private async navigate(url: string): Promise<void> {
    const navigateTool = toolRegistry.get("navigate_to_url");
    if (!navigateTool) throw new Error("navigate_to_url tool not registered");

    const result = await navigateTool.execute({ url });
    if (!result.success) throw new Error(`Navigation failed: ${result.error}`);
  }

  private async scrollToForm(): Promise<void> {
    const scrollTool = toolRegistry.get("scroll");
    if (!scrollTool) {
      logger.warn("scroll tool not registered, skipping scroll");
      return;
    }

    const cardSelectors = [
      "section:has(#form-rhf-demo)",
      "article:has(#form-rhf-demo)",
      "#form-rhf-demo",
      "text=Bug Report",
      "text=Bug Title",
    ];

    for (const selector of cardSelectors) {
      const result = await scrollTool.execute({ selector, behavior: "instant" }).catch(() => null);
      if (result?.success) {
        logger.info("Scrolled to form", { selector });
        return;
      }
    }

    logger.warn("Could not scroll directly to form, scrolling by pixels");
    await scrollTool.execute({ direction: "down", pixels: 400 });
  }

  private async fillFormFields(config: ReturnType<typeof getConfig>): Promise<boolean> {
    if (!this.page) return false;

    const result = await this.detector.findFormFields(this.page);
    let filledCount = 0;

    if (result.titleField) {
      logger.info("Found title field, filling...");
      const sendKeysTool = toolRegistry.get("send_keys");
      if (sendKeysTool) {
        const sr = await sendKeysTool.execute({
          text: config.formName,
          selector: "#form-rhf-demo-title",
        }).catch(() => null);
        if (sr?.success) filledCount++;
      }
    }

    if (result.descriptionField) {
      logger.info("Found description field, filling...");
      const sendKeysTool = toolRegistry.get("send_keys");
      if (sendKeysTool) {
        const sr = await sendKeysTool.execute({
          text: config.formDescription,
          selector: "#form-rhf-demo-description",
        }).catch(() => null);
        if (sr?.success) filledCount++;
      }
    }

    if (filledCount === 0) {
      logger.warn("No fields found via detector, trying fallback selectors...");
      return await this.fillFormFallback(config);
    }

    return filledCount > 0;
  }

  private async fillFormFallback(config: ReturnType<typeof getConfig>): Promise<boolean> {
    if (!this.page) return false;
    let filled = false;

    const sendKeysTool = toolRegistry.get("send_keys");
    if (!sendKeysTool) return false;

    const titleAttempts = [
      { selector: "#form-rhf-demo-title" },
      { placeholder: "Login button not working on mobile" },
      { name: "title" },
      { role: "textbox" },
      { label: "Bug Title" },
    ];

    for (const attempt of titleAttempts) {
      const result = await sendKeysTool.execute({
        ...attempt,
        text: config.formName,
      }).catch(() => null);
      if (result?.success) {
        filled = true;
        break;
      }
    }

    const descAttempts = [
      { selector: "#form-rhf-demo-description" },
      { placeholder: "I'm having an issue with the login button on mobile." },
      { name: "description" },
      { label: "Description" },
    ];

    for (const attempt of descAttempts) {
      const result = await sendKeysTool.execute({
        ...attempt,
        text: config.formDescription,
      }).catch(() => null);
      if (result?.success) {
        filled = true;
        break;
      }
    }

    return filled;
  }

  private async takeScreenshot(name: string): Promise<string | null> {
    const screenshotTool = toolRegistry.get("take_screenshot");
    if (!screenshotTool) {
      logger.warn("take_screenshot tool not registered");
      return null;
    }

    const result = await screenshotTool.execute({ name, fullPage: true });
    if (!result.success) {
      logger.warn("Screenshot failed", { name, error: result.error });
      return null;
    }

    const data = result.data as { path: string };
    return data.path;
  }

  private failure(error: string, screenshotPaths: string[]): AgentResult {
    return {
      success: false,
      screenshotPaths,
      error,
      durationMs: Date.now() - this.startTime,
    };
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info("Browser closed");
      }
    } catch (error) {
      logger.warn("Error during cleanup", { error: String(error) });
    }
  }
}
