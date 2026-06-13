# Website Automation Agent

An intelligent browser automation agent that autonomously navigates web pages, detects form elements, and fills them. Built with TypeScript and Playwright.

## Overview

This agent navigates to a target URL, detects form fields using multi-strategy element detection, and fills in the required information — all without manual intervention.

## Prerequisites

- [Bun](https://bun.sh) v1.2+ runtime
- Node.js 18+ (for Playwright browser binaries)

## Setup

```bash
# Install dependencies
bun install

# Install Playwright browser (chromium)
npx playwright install chromium

# Configure environment (edit as needed)
cp .env.example .env
```

## Configuration

All settings are managed via `.env` file:

| Variable | Default | Description |
|---|---|---|
| `TARGET_URL` | shadcn react-hook-form page | URL to automate |
| `HEADLESS` | `false` | Run browser in headless mode |
| `BROWSER_CHANNEL` | `chromium` | Browser engine |
| `FORM_NAME` | `Test User` | Value for the title/name field |
| `FORM_DESCRIPTION` | `Automated description from browser agent` | Value for the description field |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `SCREENSHOT_ON_FAILURE` | `true` | Capture screenshot on error |

## Usage

```bash
bun run index.ts
```

The agent will:
1. Launch a browser
2. Navigate to the target URL
3. Detect the form fields using multiple strategies
4. Fill in the name/title and description fields
5. Capture screenshots before and after
6. Close the browser

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design details.

## Tools

| Tool | Description |
|---|---|
| `open_browser` | Launches a browser instance |
| `navigate_to_url` | Navigates to a given URL |
| `click_on_screen` | Clicks at coordinates or on elements |
| `send_keys` | Types text into form fields |
| `scroll` | Scrolls the page |
| `double_click` | Performs double-click actions |
| `take_screenshot` | Captures the current page state |

## Project Structure

```
backend/
├── index.ts                  # Entry point
├── src/
│   ├── agent/
│   │   ├── Agent.ts          # Orchestrator
│   │   ├── index.ts          # Tool exports
│   │   └── tools/            # Individual tool implementations
│   │       ├── Tool.ts               # Base class & registry
│   │       ├── OpenBrowserTool.ts
│   │       ├── NavigateTool.ts
│   │       ├── ClickTool.ts
│   │       ├── SendKeysTool.ts
│   │       ├── ScrollTool.ts
│   │       ├── DoubleClickTool.ts
│   │       └── ScreenshotTool.ts
│   └── utils/
│       ├── config.ts               # Zod-validated config
│       ├── element-detector.ts     # Multi-strategy element detection
│       └── logger.ts               # Structured logging
├── screenshots/              # Captured screenshots
├── logs/                     # Agent log files
├── .env.example              # Configuration template
└── package.json
```
