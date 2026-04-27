import { redact } from "./redact.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function currentLevel(): LogLevel {
  const raw = (process.env["TXTBOX_LOG_LEVEL"] ?? "info").toLowerCase();
  if (raw === "error" || raw === "warn" || raw === "info" || raw === "debug") {
    return raw;
  }
  return "info";
}

function emit(level: LogLevel, fields: Record<string, unknown>): void {
  if (LEVELS[level] > LEVELS[currentLevel()]) return;
  const safe: Record<string, unknown> = { level, ts: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = typeof v === "string" ? redact(v) : v;
  }
  process.stderr.write(JSON.stringify(safe) + "\n");
}

export const logger = {
  error(fields: Record<string, unknown>): void { emit("error", fields); },
  warn(fields: Record<string, unknown>): void { emit("warn", fields); },
  info(fields: Record<string, unknown>): void { emit("info", fields); },
  debug(fields: Record<string, unknown>): void { emit("debug", fields); },
};
