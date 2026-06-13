# Architecture Document

## Design Overview

The agent follows a modular tool-based architecture. Each browser action is encapsulated as a standalone tool class, and an orchestrator (`Agent`) composes these tools to perform the target task.

## Core Components

### 1. Tool System (`tools/Tool.ts`)

- **`BaseTool`** - Abstract class all tools extend. Provides context injection (`page`, `browser`, `context`) and convenience methods (`success()`, `failure()`).
- **`ToolRegistry`** - Central registry mapping tool names to tool instances. Allows the Agent to look up and invoke any tool by name.
- **`ToolContext`** - Shared state object (`{ page, browser, context }`) propagated to all tools.

### 2. Tools (7 total)

Each tool implements `execute(params)` and handles a single browser action:

| Tool | Purpose | Key Features |
|---|---|---|
| `OpenBrowserTool` | Launch browser | Supports chromium/firefox/webkit, configurable viewport |
| `NavigateTool` | Go to URL | Supports wait strategies, timeout config |
| `ClickTool` | Mouse click | Coordinates, CSS selectors, text, role, test ID |
| `SendKeysTool` | Type text | Selector-based targeting, auto-clear, type vs fill |
| `ScrollTool` | Scroll page | Pixel/direction scrolling, scroll-into-view |
| `DoubleClickTool` | Double click | Same targeting as ClickTool |
| `ScreenshotTool` | Capture screen | Full-page or element screenshots |

### 3. Element Detector (`utils/element-detector.ts`)

Multi-strategy element location system. Strategies are tried in priority order:

1. `testId` - `data-testid` attribute
2. `label` - Associated `<label>` text
3. `placeholder` - Placeholder attribute
4. `role+name` - ARIA role with accessible name
5. `role` - ARIA role alone
6. `name` - `getByLabel` fallback
7. `css-selector` - Type-based selectors
8. `nearby-text` - Sibling text to parent traversal

The detector's `findFormFields()` method is tailored for the shadcn form structure, specifically targeting the demo form with "Bug Title" input and "Description" textarea.

### 4. Configuration (`utils/config.ts`)

Zod-validated schema for all configuration. Reads from environment variables (loaded automatically by Bun). Provides typed access and sensible defaults.

### 5. Logger (`utils/logger.ts`)

Structured logger with:
- Configurable log levels (debug/info/warn/error)
- Color-coded console output
- Optional file logging with timestamps
- Metadata support for structured data

### 6. Agent (`agent/Agent.ts`)

The orchestrator that composes tools to complete the task:

```
Start
  │
  ├── open_browser ────── Launch browser instance
  ├── create_page ─────── Open new tab
  ├── navigate_to_url ─── Go to target (shadcn form docs)
  ├── take_screenshot ─── Capture initial state
  ├── scroll ──────────── Reveal form if below fold
  ├── find_form_fields ── Detect name/description inputs
  ├── send_keys (×2) ──── Fill both fields
  ├── take_screenshot ─── Capture final state
  └── close_browser ───── Cleanup
```

## Error Handling

- **Per-tool errors**: Each tool wraps its operation in try/catch and returns `{ success: false, error: "..." }`
- **Agent-level retry**: Falls back through multiple selector strategies if fields aren't found
- **Screenshot on failure**: Captures page state when errors occur
- **Cleanup in `finally`**: Ensures browser closes even on failure

## Data Flow

```
.env ──> getConfig() ──> typed Config object
                              │
Agent.run() ──> ToolRegistry.get(name).execute(params)
                    │
                    └──> Playwright API on shared Page
                              │
                         ElementDetector.findElement()
                              │
                    └──> Locator ──> click / fill / screenshot
```

## Design Decisions

1. **Tool-based modularity**: Each action is isolated for testability and reusability
2. **Shared context**: Tools don't own browser state; it's injected via context
3. **Multi-strategy detection**: No single selector works across all pages; trying strategies in priority order maximizes robustness
4. **Zod for config**: Runtime validation catches misconfiguration early
5. **Registry pattern**: Allows dynamic tool discovery and easy extension
