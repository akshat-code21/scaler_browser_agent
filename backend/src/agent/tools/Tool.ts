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