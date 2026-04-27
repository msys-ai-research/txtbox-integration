import {
  TxtboxApiError,
  TxtboxAuthError,
  TxtboxRateLimitError,
} from "./errors.js";

export interface TxtboxOk {
  ok: true;
  raw: unknown;
  txnId?: string;
}

export function interpretResponse(
  status: number,
  rawText: string,
  retryAfterHeader: string | null,
): TxtboxOk {
  // 1. Auth — body irrelevant.
  if (status === 401 || status === 403) {
    throw new TxtboxAuthError(`Auth failed (HTTP ${status})`);
  }

  // 2. Rate limit — body irrelevant. Caller decides retry; we only reach
  //    here if the caller has exhausted retries.
  if (status === 429) {
    throw new TxtboxRateLimitError("Rate limited", retryAfterHeader);
  }

  // 3. 5xx is ALWAYS an upstream error, regardless of body content.
  if (status >= 500) {
    throw new TxtboxApiError("upstream error, try again");
  }

  // 4. Try to parse JSON.
  let body: unknown = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    if (status >= 400) {
      throw new TxtboxApiError(`HTTP ${status}: ${rawText.slice(0, 200)}`);
    }
    // Non-JSON 2xx is unexpected (Txtbox returns JSON). Treat as error
    // to avoid masking HTML error pages from CDNs/proxies.
    throw new TxtboxApiError(
      `unexpected non-JSON 2xx response: ${rawText.slice(0, 200)}`,
    );
  }

  // 5. Application-level failure can ride on ANY status, including 200.
  //    Permissive against multiple shapes until the real schema is captured.
  const b = body as Record<string, unknown> | null;
  const errors = b?.["errors"] as Record<string, unknown> | undefined;
  const appFailure =
    b?.["success"] === false ||
    b?.["status"] === "failed" ||
    (b?.["error"] != null && b["error"] !== "") ||
    (errors != null && Object.keys(errors).length > 0);

  if (appFailure) {
    const msg =
      (b?.["message"] as string | undefined) ??
      (b?.["error"] as string | undefined) ??
      (errors ? JSON.stringify(errors) : `HTTP ${status}`);
    throw new TxtboxApiError(String(msg));
  }

  // 6. 4xx with JSON body but no app-failure markers — still an error.
  if (status >= 400) {
    throw new TxtboxApiError(
      String(
        (b?.["message"] as string | undefined) ??
          (b?.["error"] as string | undefined) ??
          `HTTP ${status}`,
      ),
    );
  }

  // 7. Success.
  const data = b?.["data"] as Record<string, unknown> | undefined;
  return {
    ok: true,
    raw: body,
    txnId:
      (b?.["txn_id"] as string | undefined) ??
      (b?.["transaction_id"] as string | undefined) ??
      (data?.["txn_id"] as string | undefined) ??
      (data?.["id"] as string | undefined),
  };
}
