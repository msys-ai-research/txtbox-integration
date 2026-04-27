import { interpretResponse, type TxtboxOk } from "./interpretResponse.js";
import { logger } from "../util/logger.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BASE = "https://ws-v2.txtbox.com";
const PATH = "/messaging/v1/sms/push";

interface AttemptResult {
  status: number;
  text: string;
  retryAfter: string | null;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// `Retry-After` may be delta-seconds OR an HTTP-date.
// Default 1000ms when missing/unparseable. Cap 5000ms.
export function parseRetryAfter(raw: string | null): number {
  if (!raw) return 1000;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(parseInt(trimmed, 10) * 1000, 5000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return Math.max(0, Math.min(delta, 5000));
  }
  return 1000;
}

export interface PushSmsArgs {
  apiKey: string;
  to: string;
  message: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function pushSms(args: PushSmsArgs): Promise<TxtboxOk> {
  const base = args.baseUrl ?? DEFAULT_BASE;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = base + PATH;
  const body = new URLSearchParams({
    number: args.to,
    message: args.message,
  }).toString();

  const attempt = async (): Promise<AttemptResult> => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "X-TXTBOX-Auth": args.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        signal: ac.signal,
      });
      const text = await res.text();
      return {
        status: res.status,
        text,
        retryAfter: res.headers.get("retry-after"),
        durationMs: Date.now() - start,
      };
    } finally {
      clearTimeout(t);
    }
  };

  let r = await attempt();
  logger.info({ msg: "POST /sms/push", status: r.status, duration_ms: r.durationMs });
  if (r.status === 429) {
    const wait = parseRetryAfter(r.retryAfter);
    logger.warn({ msg: "rate limited; retrying once", wait_ms: wait });
    await sleep(wait);
    r = await attempt();
    logger.info({ msg: "POST /sms/push retry", status: r.status, duration_ms: r.durationMs });
  }
  return interpretResponse(r.status, r.text, r.retryAfter);
}
