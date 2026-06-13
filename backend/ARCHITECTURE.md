# Architecture Document

## Design Overview

The agent uses a hybrid architecture: a deterministic framework (browser lifecycle) wraps an AI-driven reasoning loop. Each browser action (click, type, scroll) is a modular tool. The LLM (NVIDIA Nemotron 3 Nano Omni via OpenRouter) receives screenshots + page text and decides which tool to call next. Tool results are fed back into the conversation until the task is complete.

```
┌─────────────────────────────────────────────────────┐
│                  AIAgent.run()                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ open_browser │  │ create_page  │  │ navigate  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                 │        │
│         └─────────────────┴─────────────────┘        │
│                           │                          │
│                    ┌──────▼───────┐                   │
│                    │ AI REASONING │                   │
│                    │    LOOP      │                   │
│                    └──────┬───────┘                   │
│          ┌────────────────┼────────────────┐          │
│          │                │                │          │
│    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐    │
│    │screenshot │   │  LLM      │   │ execute   │    │
│    │+ page text│──▶│ decides   │──▶│ tool call │    │
│    └───────────┘   │ action    │   └─────┬─────┘    │
│                    └───────────┘         │          │
│                     │                    │          │
│                     └────────────────────┘          │
│                           │                         │
│                     ┌─────▼──────┐                  │
│                     │ task done? │                  │
│                     └─────┬──────┘                  │
│                      yes/  no                       │
│                        │    └── loop back            │
│                   ┌────▼────┐                       │
│                   │ cleanup │                       │
│                   └─────────┘                       │
└─────────────────────────────────────────────────────┘
```

## Core Components

### 1. Tool System (`tools/Tool.ts`)

- **`BaseTool`** - Abstract class all 7 tools extend. Provides context injection (`page`, `browser`, `context`) and convenience methods (`success()`, `failure()`).
- **`ToolRegistry`** - Central `Map<string, BaseTool>` registry. Tools self-register at module import time via `toolRegistry.register(new XTool())`. The barrel file (`agent/index.ts`) imports all tools, triggering registration before the agent starts.
- **`ToolContext`** - Shared state (`{ page, browser, context }`) propagated to all tools via `setContextForAll()`.

### 2. Tools (7 total)

| Tool | Purpose | Key Features |
|---|---|---|
| `OpenBrowserTool` | Launch browser | chromium/firefox/webkit, viewport config |
| `NavigateTool` | Go to URL | waitUntil strategies, response status check |
| `ClickTool` | Mouse click | Coordinates, CSS selector, text, role, testId; **returns hint if input field clicked** |
| `SendKeysTool` | Type text | Selector/placeholder/label targeting, auto-clear |
| `ScrollTool` | Scroll page | Pixel/direction, scroll-into-view |
| `DoubleClickTool` | Double click | Same targeting as ClickTool |
| `ScreenshotTool` | Capture screen | Full-page or element, JPEG compression for LLM |

### 3. LLM Integration (`llm/`)

**`LLMClient.ts`** - OpenRouter API wrapper using the OpenAI SDK (OpenRouter is API-compatible):
- Sends chat completion requests with tool definitions
- Converts screenshots to base64 JPEG for vision input
- Falls back to text-only if the model doesn't support vision (404 handler)
- Parses tool call responses and returns structured `LLMResponse`

**`toolDefinitions.ts`** - 6 tool schemas in OpenAI function-calling format:
- `navigate_to_url` - Go to a URL
- `click_on_screen` - Click by CSS selector, visible text, or coordinates
- `send_keys` - Type into form fields (by selector, placeholder, or label)
- `scroll` - Scroll by direction or element
- `double_click` - Double-click by selector/text/coordinates
- `take_screenshot` - Capture page for visual inspection

### 4. AIAgent (`agent/AIAgent.ts`)

The reasoning loop orchestrator:

```
run()
  ├── openBrowser()        ── toolRegistry via open_browser
  ├── createPage()         ── newPage() + setContextForAll()
  ├── navigate()           ── toolRegistry via navigate_to_url
  ├── reasoningLoop()      ── THE AI LOOP:
  │     for step = 1..maxSteps:
  │       1. Capture screenshot → base64 JPEG
  │       2. Build messages: system prompt + conversation history
  │       3. Call LLMClient.chat(messages, screenshot, page)
  │       4. If finish_reason == "tool_calls":
  │            a. Append assistant message with tool_calls to history
  │            b. For each tool call:
  │               - Validate tool name (knownTools check)
  │               - Map LLM function → tool name (mapFunctionToTool)
  │               - Map LLM args → tool params (mapArgs)
  │               - Execute via toolRegistry
  │               - Append tool result message to history
  │            c. Loop back to step 1
  │       5. If finish_reason == "stop":
  │            a. Task complete, return summary
  │       6. If max steps reached: return failure
  └── cleanup()            ── browser.close()
```

Key design points:
- **Vision integration**: Screenshot is taken fresh before each LLM call, compressed as JPEG quality 70, sent as `image_url` content
- **Self-correction**: ClickTool detects when you click on an `<input>`/`<textarea>` and returns a `hint` field telling the LLM to use `send_keys`
- **Unknown tool handling**: If the LLM hallucinates a tool name (e.g., "finish"), the agent returns a clear error listing available tools

### 5. Configuration (`utils/config.ts`)

Zod-validated schema with 20 fields covering browser settings, timeouts, form values, logging, screenshots, retries, and LLM settings. Bun auto-loads `.env` files, so `process.env` is populated at runtime. A custom `parseBool()` function handles the `"false"` string correctly (unlike `z.coerce.boolean()`).

### 6. Logger (`utils/logger.ts`)

Structured logger with configurable levels (debug/info/warn/error), color-coded console output, and optional file logging with timestamps.

## Error Handling

- **Per-tool errors**: Each tool wraps execution in try/catch, logs the error, returns `{ success: false, error: "..." }`
- **LLM errors**: 429 rate limits, 400/404 model issues are caught and logged; vision fallback retries without screenshot
- **Unknown tool calls**: Validated against a known-tools list; clear error message returned to LLM
- **Max step guard**: Hard cap prevents infinite loops (configurable via `MAX_AGENT_STEPS`)
- **Cleanup guarantee**: Browser always closes via `finally` block
- **Screenshot on failure**: Captures page state when errors occur

## Data Flow

```
.env ──> getConfig() ──> typed Config object
                              │
AIAgent.run()                  │
  ├── openBrowser()            │
  ├── navigate()               │
  └── reasoningLoop()          │
        │                      │
        ├── take screenshot ───┤
        │                      │
        ├── LLM client ────────┤
        │   POST openrouter.ai │
        │   { screenshot,      │
        │     page text,       │
        │     tool definitions }│
        │                      │
        ├── tool call ◄────────┘
        │   ToolRegistry
        │   └── execute()
        │       └── Playwright API
        │
        └── loop until done
```

## Design Decisions

1. **LLM-driven decisions** - Instead of hardcoded selectors and workflows, the LLM "sees" the page via screenshots and decides actions dynamically. This handles page structure changes gracefully.

2. **Tool-based modularity** - Each action is isolated. New tools can be added without changing the reasoning loop.

3. **Vision + text context** - Screenshots provide visual context (layout, colors, positions). Page text provides exact URLs, labels, and values. Combined, the LLM has comprehensive situational awareness.

4. **Self-correction hints** - Tool results include guidance (e.g., "you clicked an input field, now use send_keys") to help the LLM avoid common mistakes.

5. **Zod for config** - Runtime validation catches misconfiguration early with clear error messages.

6. **OpenRouter compatibility** - Using the OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"` allows swapping models without code changes. The `:free` suffix enables zero-cost testing.
