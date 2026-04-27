import { getRequestApiKey } from "./requestContext.js";

const PH_NUMBER_RE = /(\+?63|0)9\d{9}/g;

export function maskPhNumber(input: string): string {
  return input.replace(PH_NUMBER_RE, (match) => {
    const digits = match.replace(/[^\d]/g, "");
    const last4 = digits.slice(-4);
    const prefix = match.startsWith("+") ? "+639XX" : "09XX";
    return `${prefix}***${last4}`;
  });
}

export function redact(input: unknown): string {
  let s = typeof input === "string" ? input : safeStringify(input);
  // Prefer the per-request key from AsyncLocalStorage; fall back to env so
  // unit tests and any out-of-request callsites still scrub a known secret.
  const key = getRequestApiKey() ?? process.env["TXTBOX_API_KEY"];
  if (key && key.length > 0) {
    s = s.split(key).join("***REDACTED***");
  }
  s = maskPhNumber(s);
  return s;
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) {
    return `${v.name}: ${v.message}`;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
