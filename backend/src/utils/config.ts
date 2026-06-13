/**
 * Zod-validated configuration loaded from environment variables.
 * Bun auto-loads .env files, so process.env is populated at runtime.
 */
import { z } from "zod";

/** Handles "true"/"false" strings properly (unlike z.coerce.boolean() which treats any non-empty string as true). */
function parseBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
  return false;
}

const configSchema = z.object({
  targetUrl: z.string().url().default("https://ui.shadcn.com/docs/forms/react-hook-form"),
  headless: z.preprocess(parseBool, z.boolean()).default(false),
  browserChannel: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  viewportWidth: z.coerce.number().int().positive().default(1280),
  viewportHeight: z.coerce.number().int().positive().default(720),
  navigationTimeoutMs: z.coerce.number().int().positive().default(30000),
  elementTimeoutMs: z.coerce.number().int().positive().default(10000),
  actionTimeoutMs: z.coerce.number().int().positive().default(5000),
  formName: z.string().default("Test User"),
  formDescription: z.string().default("Automated description from browser agent"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  logToFile: z.preprocess(parseBool, z.boolean()).default(true),
  logDir: z.string().default("./logs"),
  screenshotDir: z.string().default("./screenshots"),
  screenshotOnFailure: z.preprocess(parseBool, z.boolean()).default(true),
  screenshotOnSuccess: z.preprocess(parseBool, z.boolean()).default(true),
  maxRetries: z.coerce.number().int().min(0).default(3),
  retryBaseDelayMs: z.coerce.number().int().positive().default(1000),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

/** Reads environment variables, validates them against the schema, and caches the result. */
export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const envConfig = {
    targetUrl: process.env.TARGET_URL,
    headless: process.env.HEADLESS,
    browserChannel: process.env.BROWSER_CHANNEL,
    viewportWidth: process.env.VIEWPORT_WIDTH,
    viewportHeight: process.env.VIEWPORT_HEIGHT,
    navigationTimeoutMs: process.env.NAVIGATION_TIMEOUT_MS,
    elementTimeoutMs: process.env.ELEMENT_TIMEOUT_MS,
    actionTimeoutMs: process.env.ACTION_TIMEOUT_MS,
    formName: process.env.FORM_NAME,
    formDescription: process.env.FORM_DESCRIPTION,
    logLevel: process.env.LOG_LEVEL,
    logToFile: process.env.LOG_TO_FILE,
    logDir: process.env.LOG_DIR,
    screenshotDir: process.env.SCREENSHOT_DIR,
    screenshotOnFailure: process.env.SCREENSHOT_ON_FAILURE,
    screenshotOnSuccess: process.env.SCREENSHOT_ON_SUCCESS,
    maxRetries: process.env.MAX_RETRIES,
    retryBaseDelayMs: process.env.RETRY_BASE_DELAY_MS,
  };

  const result = configSchema.safeParse(envConfig);
  if (!result.success) {
    console.error("Configuration validation failed:");
    console.error(result.error.format());
    process.exit(1);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/** Clears the cached config (useful for testing with different environment variables). */
export function resetConfig(): void {
  cachedConfig = null;
}
