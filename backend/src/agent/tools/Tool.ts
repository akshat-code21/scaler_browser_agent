/** Shared types for tool parameters, results, and browser context. */
import { Page, Browser, BrowserContext } from "playwright";

export interface ToolParams {
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolContext {
  page?: Page;
  browser?: Browser;
  context?: BrowserContext;
}

/**
 * Base class for all browser automation tools.
 * Each tool encapsulates a single browser action (click, navigate, type, etc.)
 * and receives shared browser state via setContext().
 */
export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;

  protected context: ToolContext = {};

  setContext(context: ToolContext): void {
    this.context = context;
  }

  protected getPage(): Page {
    if (!this.context.page) {
      throw new Error(`Tool ${this.name} requires a page context`);
    }
    return this.context.page;
  }

  abstract execute(params: ToolParams): Promise<ToolResult>;

  protected success(data?: unknown): ToolResult {
    return { success: true, data };
  }

  protected failure(error: string): ToolResult {
    return { success: false, error };
  }
}

/**
 * Central registry mapping tool names to their instances.
 * Tools self-register at import time via toolRegistry.register().
 * The Agent uses this to look up and invoke tools dynamically.
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  setContextForAll(context: ToolContext): void {
    for (const tool of this.tools.values()) {
      tool.setContext(context);
    }
  }
}

export const toolRegistry = new ToolRegistry();
