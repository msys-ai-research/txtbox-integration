import { z } from "zod";
import { pushSms } from "../txtbox/client.js";
import {
  TxtboxApiError,
  TxtboxAuthError,
  TxtboxError,
  TxtboxRateLimitError,
} from "../txtbox/errors.js";
import { isPhMobile, normalize, toCanonical } from "../util/phone.js";
import { maskPhNumber, redact } from "../util/redact.js";
import { logger } from "../util/logger.js";

// In the HTTP transport, apiKey is supplied per-request from the X-TXTBOX-Auth
// header. Each request builds a fresh handler closure with the caller's key.

export const SEND_SMS_NAME = "send_sms";

export const SEND_SMS_DESCRIPTION =
  "Send a single SMS via the Txtbox platform (Philippine SMS gateway). " +
  "Use for any explicit request to text/SMS a Philippine mobile number with intent " +
  "to deliver right now. Accepts 09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX. " +
  "Messages over 160 chars are split into multiple billed segments by the platform " +
  "(up to 10 segments allowed). Custom sender names are NOT supported in v1; the " +
  "account default sender is used.";

export const SendSmsInputShape = {
  to: z
    .string()
    .min(1)
    .describe(
      "Philippine mobile number. Accepts 09XXXXXXXXX or +639XXXXXXXXX. " +
        "Set allowNonPh:true (and TXTBOX_ALLOW_NON_PH=1 in server env) to " +
        "send to non-PH numbers.",
    ),
  message: z
    .string()
    .min(1)
    .max(1600)
    .describe(
      "SMS body. Plain text. 160 chars/segment; up to 10 segments (1600 chars total).",
    ),
  allowNonPh: z
    .boolean()
    .optional()
    .describe(
      "Per-call opt-in to bypass PH phone validation. Requires TXTBOX_ALLOW_NON_PH=1 " +
        "in server env; otherwise ignored and PH validation still runs.",
    ),
};

export const SendSmsInput = z.object(SendSmsInputShape);

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [k: string]: unknown;
}

function errMessage(e: unknown): string {
  if (e instanceof TxtboxRateLimitError) return `Rate limited: ${e.message}`;
  if (e instanceof TxtboxAuthError) return `Auth failed: ${e.message}`;
  if (e instanceof TxtboxApiError) return e.message;
  if (e instanceof TxtboxError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export interface HandlerDeps {
  apiKey: string;
  push?: typeof pushSms;
}

export function createSendSmsHandler(deps: HandlerDeps) {
  const push = deps.push ?? pushSms;
  const apiKey = deps.apiKey.trim();

  return async function handler(
    input: z.infer<typeof SendSmsInput>,
  ): Promise<ToolResult> {
    if (!apiKey) {
      return {
        isError: true,
        content: [
          { type: "text", text: "Auth failed: X-TXTBOX-Auth header is empty." },
        ],
      };
    }

    let to: string;
    const allowBypass =
      input.allowNonPh === true && process.env["TXTBOX_ALLOW_NON_PH"] === "1";

    if (allowBypass) {
      to = normalize(input.to);
      if (!to) {
        return {
          isError: true,
          content: [{ type: "text", text: "Invalid phone: empty after normalization." }],
        };
      }
    } else {
      if (!isPhMobile(input.to)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `Invalid PH phone: "${redact(input.to)}". ` +
                "Expected 09XXXXXXXXX or +639XXXXXXXXX.",
            },
          ],
        };
      }
      to = toCanonical(input.to);
    }

    const segments = Math.ceil(input.message.length / 160);
    const masked = maskPhNumber(to);
    logger.debug({ msg: "send_sms call", to: masked, messageLen: input.message.length });

    try {
      const ok = await push({ apiKey, to, message: input.message });
      const txn = ok.txnId ? `, txn_id=${ok.txnId}` : "";
      const primary = `SMS queued: to=${masked}, segments=${segments}${txn}`;
      const debug = redact(
        typeof ok.raw === "string" ? ok.raw : JSON.stringify(ok.raw),
      );
      return {
        content: [
          { type: "text", text: primary },
          { type: "text", text: debug },
        ],
      };
    } catch (e) {
      const msg = redact(errMessage(e));
      return {
        isError: true,
        content: [{ type: "text", text: `SMS failed: ${msg}` }],
      };
    }
  };
}
