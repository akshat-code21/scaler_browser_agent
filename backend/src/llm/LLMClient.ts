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

function extractPageText(page: any): string {
  const url = page.url();
  const title = page.title();
  return `URL: ${url}\nPage Title: ${title}`;
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
      userContent.push({ type: "text", text: extractPageText(page) });
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
