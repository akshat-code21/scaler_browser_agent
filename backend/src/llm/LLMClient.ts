import OpenAI from "openai";
import { logger } from "../utils/logger.js";
import { toolDefinitions } from "./toolDefinitions.js";
import type { ChatCompletionMessageParam, ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";

export interface LLMConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxSteps: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
}

async function extractPageContext(page: any): Promise<string> {
  const url = page.url();
  const title = await page.title();

  let interactiveHtml = "";
  try {
    interactiveHtml = await page.evaluate(() => {
      const selectors = [
        'input', 'textarea', 'button', 'select', 'a[href]',
        '[role="button"]', '[role="link"]', '[role="searchbox"]',
        '[role="textbox"]', '[role="combobox"]', '[role="menuitem"]',
        '[contenteditable="true"]', 'video', 'audio',
      ];
      const elements = document.querySelectorAll(selectors.join(', '));
      const MAX_ELEMENTS = 80;
      const results: string[] = [];

      for (let i = 0; i < Math.min(elements.length, MAX_ELEMENTS); i++) {
        const el = elements[i] as HTMLElement;
        // Skip hidden elements
        if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const tag = el.tagName.toLowerCase();
        const attrs: string[] = [];
        if (el.id) attrs.push(`id="${el.id}"`);
        if (el.getAttribute('name')) attrs.push(`name="${el.getAttribute('name')}"`);
        if (el.getAttribute('type')) attrs.push(`type="${el.getAttribute('type')}"`);
        if (el.getAttribute('placeholder')) attrs.push(`placeholder="${el.getAttribute('placeholder')}"`);
        if (el.getAttribute('aria-label')) attrs.push(`aria-label="${el.getAttribute('aria-label')}"`);
        if (el.getAttribute('role')) attrs.push(`role="${el.getAttribute('role')}"`);
        if (el.getAttribute('href')) {
          const href = el.getAttribute('href')!;
          attrs.push(`href="${href.length > 80 ? href.slice(0, 80) + '…' : href}"`);
        }
        if (el.className && typeof el.className === 'string') {
          const cls = el.className.trim();
          if (cls.length > 0 && cls.length <= 100) attrs.push(`class="${cls}"`);
        }
        if ((el as HTMLInputElement).value) {
          const val = (el as HTMLInputElement).value;
          attrs.push(`value="${val.length > 40 ? val.slice(0, 40) + '…' : val}"`);
        }

        const text = (el.textContent || '').trim().slice(0, 60);
        const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
        results.push(`[${results.length}] <${tag}${attrStr}>${text ? text : ''}</${tag}>`);
      }

      return results.join('\n');
    });
  } catch (err) {
    interactiveHtml = "(Could not extract DOM elements)";
  }

  return [
    `Current URL: ${url}`,
    `Page Title: ${title}`,
    ``,
    `Interactive DOM Elements on page:`,
    interactiveHtml || "(No interactive elements found)",
  ].join('\n');
}

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxSteps: number;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      // baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.apiKey,
      defaultQuery: { model: config.model },
    });
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxSteps = config.maxSteps;
  }

  getMaxSteps(): number {
    return this.maxSteps;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    screenshotBase64?: string,
    page?: any,
    disableTools = false,
  ): Promise<LLMResponse> {
    const userContent: any[] = [];

    if (screenshotBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${screenshotBase64}`, detail: "high" },
      });
    }

    if (page) {
      const pageContext = await extractPageContext(page);
      userContent.push({ type: "text", text: pageContext });
    }

    const allMessages: ChatCompletionMessageParam[] = [...messages];
    if (userContent.length > 0) {
      allMessages.push({ role: "user", content: userContent as any });
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages,
        ...(disableTools ? {} : { tools: toolDefinitions }),
        temperature: this.temperature,
      });

      const choice = response.choices[0];
      if (!choice) {
        return { content: null, toolCalls: [], finishReason: "error", usage: null };
      }

      const functionToolCalls = (choice.message.tool_calls || []).filter(
        (tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === "function"
      );
      const toolCalls: ToolCall[] = functionToolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));

      let finishReason: LLMResponse["finishReason"] = "stop";
      if (choice.finish_reason === "tool_calls") finishReason = "tool_calls";
      else if (choice.finish_reason === "length") finishReason = "length";

      return {
        content: choice.message.content,
        toolCalls,
        finishReason,
        usage: response.usage
          ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
          : null,
      };
    } catch (error: any) {
      logger.error("LLM API call failed", { error: error.message, status: error.status });
      if ((error.status === 400 || error.status === 404) && screenshotBase64) {
        logger.warn("Model may not support vision, retrying without screenshot");
        return this.chat(messages, undefined, page, disableTools);
      }
      return { content: null, toolCalls: [], finishReason: "error", usage: null };
    }
  }
}
