import { toolRegistry } from "./tools/Tool.js";
import { LLMClient, LLMConfig } from "../llm/LLMClient.js";
import { getConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { Page, Browser, BrowserContext } from "playwright";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface AgentResult {
  success: boolean;
  steps: number;
  screenshotPaths: string[];
  llmSummary?: string;
  error?: string;
  durationMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export class AIAgent {
  private page: Page | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private startTime: number = 0;
  private screenshotPaths: string[] = [];
  private llmClient!: LLMClient;
  private totalTokens = { prompt: 0, completion: 0, total: 0 };

  async run(prompt?: string): Promise<AgentResult> {
    this.startTime = Date.now();
    const config = getConfig();

    const llmConfig: LLMConfig = {
      apiKey: config.llmApiKey,
      model: config.llmModel,
      temperature: config.llmTemperature,
      maxSteps: config.maxAgentSteps,
    };
    this.llmClient = new LLMClient(llmConfig);

    const isDefaultTask = !prompt;

    try {
      await this.openBrowser();
      const page = await this.createPage();
      this.page = page;

      let result: AgentResult;

      if (isDefaultTask) {
        logger.info("AIAgent running default task in backward compatibility mode", { targetUrl: config.targetUrl, model: config.llmModel });
        await this.navigate(config.targetUrl);
        result = await this.reasoningLoopDefault(config);
      } else {
        logger.info("AIAgent running custom task", { rawTask: prompt, model: config.llmModel });
        const refinedTask = await this.refinePrompt(prompt);

        let startUrl = this.extractStartUrl(prompt, config.targetUrl);

        logger.info(`Pre-navigating browser to target: ${startUrl}`);
        await this.navigate(startUrl);

        result = await this.reasoningLoopGeneric(config, refinedTask);
      }

      const finalScreenshot = await this.takeScreenshot("final");
      if (finalScreenshot) this.screenshotPaths.push(finalScreenshot);

      result.screenshotPaths = [...this.screenshotPaths];
      result.durationMs = Date.now() - this.startTime;
      result.tokenUsage = { ...this.totalTokens };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("AIAgent failed", { error: message });
      if (config.screenshotOnFailure && this.page) {
        const failScreenshot = await this.takeScreenshot("failure").catch(() => null);
        if (failScreenshot) this.screenshotPaths.push(failScreenshot);
      }
      return {
        success: false,
        steps: 0,
        screenshotPaths: [...this.screenshotPaths],
        error: message,
        durationMs: Date.now() - this.startTime,
        tokenUsage: { ...this.totalTokens },
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Extracts a navigable URL from the user's raw prompt.
   * Handles full URLs, bare domains (e.g. "netflix.com"), and common
   * site name references (e.g. "youtube", "google").
   * Falls back to about:blank so the agent starts with a clean page
   * instead of the default shadcn form.
   */
  private extractStartUrl(prompt: string, _fallback: string): string {
    const lower = prompt.toLowerCase();

    // 1. Full URL with protocol
    const fullUrlMatch = prompt.match(/(https?:\/\/[^\s"']+)/);
    if (fullUrlMatch && fullUrlMatch[1]) {
      return fullUrlMatch[1].replace(/[.,;:!?'")]+$/, "");
    }

    // 2. Bare domain with TLD (e.g. "netflix.com", "docs.google.com")
    const domainMatch = lower.match(/(?:go\s+to|open|visit|navigate\s+to|browse\s+to)?\s*([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|org|net|io|dev|edu|gov|co|ai|app|tv|me|info|xyz)(?:\/[^\s"']*)?)/i);
    if (domainMatch && domainMatch[1]) {
      const domain = domainMatch[1].replace(/[.,;:!?'")]+$/, "");
      return `https://${domain}`;
    }

    // 3. Well-known site names without TLD
    const knownSites: Record<string, string> = {
      youtube: "https://www.youtube.com",
      google: "https://www.google.com",
      github: "https://www.github.com",
      twitter: "https://www.twitter.com",
      x: "https://www.x.com",
      reddit: "https://www.reddit.com",
      facebook: "https://www.facebook.com",
      instagram: "https://www.instagram.com",
      linkedin: "https://www.linkedin.com",
      amazon: "https://www.amazon.com",
      netflix: "https://www.netflix.com",
      wikipedia: "https://www.wikipedia.org",
      stackoverflow: "https://stackoverflow.com",
    };

    for (const [name, url] of Object.entries(knownSites)) {
      // Match "go to youtube", "open youtube", or just "youtube" as a word
      const pattern = new RegExp(`\\b${name}\\b`, "i");
      if (pattern.test(lower)) {
        return url;
      }
    }

    // 4. Fall back to about:blank so the agent gets a clean page
    //    instead of the unrelated shadcn form
    logger.info("No URL detected in prompt, starting with about:blank");
    return "about:blank";
  }

  private async refinePrompt(rawPrompt: string): Promise<string> {
    logger.info("Refining user prompt...");
    const systemInstruction = `You are an expert prompt engineering assistant. Your job is to take a raw user-provided task for a web automation browser agent and expand it into a clear, detailed, and structured instruction plan for the browser agent to execute.

IMPORTANT RULES:
- Do NOT add any safety warnings, CAPTCHA cautions, or "stop if blocked" instructions. The agent should always attempt to complete every step.
- If the task involves filling a form, ALWAYS include a step to submit/click the submit button unless the user explicitly says not to.
- Do NOT add constraints the user did not mention. Only expand on what the user asked.
- If the user says "dummy credentials" or "test credentials", generate plausible placeholder values (e.g. test@example.com / TestPassword123).

Format your output exactly with these headers:
HIGH-LEVEL GOAL:
<description of what the user wants to achieve>

KEY CONSTRAINTS & DETAILS:
- <any critical constraint, selectors, or input values mentioned>

STEP-BY-STEP LOGICAL APPROACH:
1. <logical action step 1>
2. <logical action step 2>`;

    try {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemInstruction,
        },
        {
          role: "user",
          content: `Refine this raw task: "${rawPrompt}"`,
        },
      ];

      const response = await this.llmClient.chat(messages, undefined, undefined, true);
      if (response.content) {
        logger.info("Prompt refinement successful", { refined: response.content });
        return response.content;
      }
    } catch (error) {
      logger.warn("Failed to refine prompt, falling back to raw prompt", { error: String(error) });
    }
    return rawPrompt;
  }

  private async reasoningLoopDefault(config: ReturnType<typeof getConfig>): Promise<AgentResult> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a web automation agent that controls a browser using tools. Complete the task step by step.

TASK: Find the demo form on this page and fill in the fields.

FORM DETAILS:
- Field 1 label/hint: "Bug Title" — fill with: "${config.formName}"
- Field 2 label: "Description" — fill with: "${config.formDescription}"
- The form is inside a card titled "Bug Report" with id="form-rhf-demo"
- The title input has id="form-rhf-demo-title" and placeholder "Login button not working on mobile"
- The description textarea has id="form-rhf-demo-description" and placeholder "I'm having an issue with the login button on mobile."

CRITICAL PLAN - EXECUTE THESE STEPS IN ORDER:
1. Scroll down once to reveal the form
2. take_screenshot to see the page
3. Use send_keys(selector="#form-rhf-demo-title", text="${config.formName}") for Bug Title
4. Use send_keys(selector="#form-rhf-demo-description", text="${config.formDescription}") for Description
5. When BOTH fields are filled, respond with a summary

RULES:
- To type text into ANY field, ONLY use "send_keys" — never click_on_screen for typing
- After clicking a field to focus it, call send_keys in your very next step
- You MUST fill BOTH fields. Do NOT skip the Description field.
- If you make a mistake, take a screenshot, assess, and correct.`,
      },
    ];

    const initialScreenshot = await this.takeScreenshot("step-0-initial");
    if (initialScreenshot) this.screenshotPaths.push(initialScreenshot);

    return this.runLoop(messages);
  }

  private async reasoningLoopGeneric(config: ReturnType<typeof getConfig>, task: string): Promise<AgentResult> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a web automation agent that controls a browser using tools. Complete the task step by step.

USER TASK:
${task}

GENERAL RULES & GUIDELINES:
- Each step you will receive TWO pieces of context: (1) a screenshot of the current page, and (2) a list of interactive DOM elements with their actual HTML attributes (id, name, aria-label, placeholder, role, class, etc.).
- ALWAYS prefer using selectors from the DOM elements list rather than guessing selectors from the screenshot. The DOM list gives you accurate, real selectors.
- To type text into ANY input field or textarea, ONLY use the "send_keys" tool with the correct CSS selector from the DOM list. Never use "click_on_screen" followed by keyboard events for typing.
- When clicking on an element, pick the best selector from the DOM elements list (prefer id, then aria-label, then name, then other attributes). You can also use exact or partial text content, role, or x/y coordinates.
- After invoking a tool, observe the updated screenshot and DOM elements in the next step to verify the result.
- If you encounter a popup, modal, or unexpected page state, adapt your actions to close it or navigate around it.
- ALWAYS complete the FULL task. If the task involves filling a form, you MUST also click the submit/sign-in/continue button. Do NOT stop after just filling in fields.
- IGNORE any CAPTCHA notices, reCAPTCHA badges, or anti-bot warnings on the page. These are typically just informational labels and do not block form submission. Always attempt to click the submit button regardless.
- Do NOT give up or stop early. Keep trying until every part of the user's task is done.
- Once the task is fully completed, respond with a summary of the accomplishments and stop (do not invoke any more tools).`,
      },
    ];

    const initialScreenshot = await this.takeScreenshot("step-0-initial");
    if (initialScreenshot) this.screenshotPaths.push(initialScreenshot);

    return this.runLoop(messages);
  }

  private async runLoop(messages: ChatCompletionMessageParam[]): Promise<AgentResult> {
    for (let step = 1; step <= this.llmClient.getMaxSteps(); step++) {
      logger.info("AI reasoning step", { step });

      const screenshotBase64 = await this.captureScreenshotBase64();
      const response = await this.llmClient.chat(messages, screenshotBase64, this.page);

      if (response.usage) {
        this.totalTokens.prompt += response.usage.promptTokens;
        this.totalTokens.completion += response.usage.completionTokens;
        this.totalTokens.total += response.usage.totalTokens;
      }

      logger.info("LLM response", {
        finishReason: response.finishReason,
        toolCalls: response.toolCalls.length,
        content: response.content?.slice(0, 100),
        tokens: response.usage,
      });

      if (response.finishReason === "error") {
        return {
          success: false,
          steps: step,
          screenshotPaths: [],
          error: "LLM returned an error response",
          durationMs: 0,
        };
      }

      if (response.finishReason === "length") {
        return {
          success: false,
          steps: step,
          screenshotPaths: [],
          error: "LLM response exceeded token limit",
          durationMs: 0,
        };
      }

      if (response.toolCalls.length > 0) {
        const assistantMsg: ChatCompletionMessageParam = {
          role: "assistant",
          content: response.content,
          tool_calls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
        messages.push(assistantMsg);

        for (const toolCall of response.toolCalls) {
          const result = await this.executeToolCall(toolCall);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      } else if (response.finishReason === "stop") {
        logger.info("AI agent completed task", { summary: response.content });
        return {
          success: true,
          steps: step,
          screenshotPaths: [],
          llmSummary: response.content ?? undefined,
          durationMs: 0,
        };
      }
    }

    return {
      success: false,
      steps: this.llmClient.getMaxSteps(),
      screenshotPaths: [],
      error: `Agent reached maximum steps (${this.llmClient.getMaxSteps()})`,
      durationMs: 0,
    };
  }

  private async executeToolCall(toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const { name, arguments: args } = toolCall;
    logger.info("Executing tool", { name, args });

    const knownTools = ["navigate_to_url", "click_on_screen", "send_keys", "scroll", "double_click", "take_screenshot"];
    if (!knownTools.includes(name)) {
      return {
        success: false,
        error: `Unknown tool "${name}". Available tools: ${knownTools.join(", ")}. Use one of these instead.`,
      };
    }

    const toolName = this.mapFunctionToTool(name);
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    const mappedArgs = this.mapArgs(name, args);
    const result = await tool.execute(mappedArgs);

    if (result.success && name === "take_screenshot" && result.data) {
      const data = result.data as { path: string };
      this.screenshotPaths.push(data.path);
    }

    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  private mapFunctionToTool(functionName: string): string {
    const mapping: Record<string, string> = {
      navigate_to_url: "navigate_to_url",
      click_on_screen: "click_on_screen",
      send_keys: "send_keys",
      scroll: "scroll",
      double_click: "double_click",
      take_screenshot: "take_screenshot",
    };
    return mapping[functionName] ?? functionName;
  }

  private mapArgs(
    functionName: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (functionName) {
      case "click_on_screen":
      case "double_click":
        if (args.selector) return { selector: args.selector };
        if (args.text) return { text: args.text };
        if (args.x !== undefined && args.y !== undefined) {
          return { x: args.x, y: args.y };
        }
        return args;
      case "send_keys":
        return {
          text: args.text,
          selector: args.selector,
          placeholder: args.placeholder,
          name: args.label,
        };
      case "scroll":
        if (args.selector) return { selector: args.selector, behavior: "instant" };
        return { direction: args.direction ?? "down", pixels: args.pixels ?? 400 };
      case "take_screenshot":
        return { name: `ai-step-${Date.now()}`, fullPage: true };
      default:
        return args;
    }
  }

  private async captureScreenshotBase64(): Promise<string | undefined> {
    if (!this.page) return undefined;
    try {
      const buffer = await this.page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
      return buffer.toString("base64");
    } catch {
      return undefined;
    }
  }

  private async openBrowser(): Promise<void> {
    const tool = toolRegistry.get("open_browser");
    if (!tool) throw new Error("open_browser tool not registered");

    const result = await tool.execute({});
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
    const tool = toolRegistry.get("navigate_to_url");
    if (!tool) throw new Error("navigate_to_url tool not registered");

    const result = await tool.execute({ url });
    if (!result.success) throw new Error(`Navigation failed: ${result.error}`);
  }

  private async takeScreenshot(name: string): Promise<string | null> {
    const tool = toolRegistry.get("take_screenshot");
    if (!tool) return null;

    const result = await tool.execute({ name, fullPage: true });
    if (!result.success) return null;

    const data = result.data as { path: string };
    return data.path;
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
