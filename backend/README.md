# AI Website Automation Agent

An intelligent browser automation agent powered by an LLM (OpenRouter) that autonomously navigates web pages, visually identifies form elements via screenshots, and fills them in. Built with TypeScript, Playwright, and the NVIDIA Nemotron 3 Nano Omni model.

## Overview

This agent uses an LLM with vision capabilities to "see" the page via screenshots, reason about what actions to take, and call browser tools (click, type, scroll, etc.) to complete tasks — all without hardcoded selectors or predetermined workflows.

## Prerequisites

- [Bun](https://bun.sh) v1.2+ runtime
- Node.js 18+ (for Playwright browser binaries)
- An [OpenRouter](https://openrouter.ai) API key (free tier works)

## Setup

```bash
# Install dependencies
bun install

# Install Playwright browser (chromium)
npx playwright install chromium

# Configure environment
cp .env.example .env
# Edit .env and set your OPENROUTER_API_KEY
```

## Configuration

All settings are managed via `.env` file:

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Your OpenRouter API key **required** |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | LLM model to use |
| `TARGET_URL` | shadcn react-hook-form page | URL to automate |
| `HEADLESS` | `false` | Run browser in headless mode |
| `FORM_NAME` | `Test User` | Value for the name/title field |
| `FORM_DESCRIPTION` | `Automated description from browser agent` | Value for the description field |
| `MAX_AGENT_STEPS` | `25` | Max AI reasoning steps before timeout |
| `LLM_TEMPERATURE` | `0.7` | LLM creativity (0-2) |

## Usage

```bash
bun run index.ts
```

The AI agent will:
1. Launch a browser and navigate to the target URL
2. Enter an AI reasoning loop:
   - Take a screenshot and extract page text
   - Send the visual + text state to the LLM with available tools
   - The LLM decides which tool to call next (click, type, scroll, etc.)
   - Execute the tool and feed the result back to the LLM
3. Repeat until the task is complete or max steps reached
4. Close the browser and report results

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full design details.

## Tools (exposed to the LLM)

| Tool | Description |
|---|---|
| `navigate_to_url` | Navigates to a given URL |
| `click_on_screen` | Clicks at coordinates, by CSS selector, or by visible text |
| `send_keys` | Types text into form fields |
| `scroll` | Scrolls the page or an element into view |
| `double_click` | Performs double-click actions |
| `take_screenshot` | Captures the current page state (vision input for LLM) |

## Project Structure

```
backend/
├── index.ts                       # Entry point
├── src/
│   ├── agent/
│   │   ├── AIAgent.ts             # AI reasoning loop orchestrator
│   │   ├── index.ts               # Barrel exports
│   │   └── tools/                 # 7 individual tool implementations
│   │       ├── Tool.ts
│   │       ├── OpenBrowserTool.ts
│   │       ├── NavigateTool.ts
│   │       ├── ClickTool.ts
│   │       ├── SendKeysTool.ts
│   │       ├── ScrollTool.ts
│   │       ├── DoubleClickTool.ts
│   │       └── ScreenshotTool.ts
│   ├── llm/
│   │   ├── LLMClient.ts           # OpenRouter API wrapper
│   │   └── toolDefinitions.ts     # LLM function-calling schemas
│   └── utils/
│       ├── config.ts              # Zod-validated config
│       └── logger.ts              # Structured logging
├── screenshots/                   # Captured screenshots
├── logs/                          # Agent log files
├── .env.example                   # Configuration template
└── package.json
```
