import fs from "fs";
import path from "path";
import { getConfig } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

class Logger {
  private logLevel: LogLevel;
  private logToFile: boolean;
  private logDir: string;
  private logFilePath: string | null = null;

  constructor() {
    const config = getConfig();
    this.logLevel = config.logLevel;
    this.logToFile = config.logToFile;
    this.logDir = config.logDir;

    if (this.logToFile) {
      this.initLogFile();
    }
  }

  private initLogFile(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logFilePath = path.join(this.logDir, `agent-${timestamp}.log`);
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  private writeToFile(formatted: string): void {
    if (this.logToFile && this.logFilePath) {
      fs.appendFileSync(this.logFilePath, formatted + "\n");
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      const formatted = this.formatMessage("debug", message, meta);
      console.log(`${COLORS.debug}${formatted}${RESET}`);
      this.writeToFile(formatted);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      const formatted = this.formatMessage("info", message, meta);
      console.log(`${COLORS.info}${formatted}${RESET}`);
      this.writeToFile(formatted);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      const formatted = this.formatMessage("warn", message, meta);
      console.warn(`${COLORS.warn}${formatted}${RESET}`);
      this.writeToFile(formatted);
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      const formatted = this.formatMessage("error", message, meta);
      console.error(`${COLORS.error}${formatted}${RESET}`);
      this.writeToFile(formatted);
    }
  }

  getLogFilePath(): string | null {
    return this.logFilePath;
  }
}

export const logger = new Logger();