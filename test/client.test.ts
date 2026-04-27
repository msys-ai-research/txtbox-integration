import { describe, it, expect, vi } from "vitest";
import { parseRetryAfter, pushSms } from "../src/txtbox/client.js";
import {
  TxtboxApiError,
  TxtboxAuthError,
  TxtboxRateLimitError,
} from "../src/txtbox/errors.js";

function mockResponse(opts: {
  status: number;
  body: string;
  retryAfter?: string;
}): Response {
  const headers = new Headers();
  if (opts.retryAfter) headers.set("retry-after", opts.retryAfter);
  return new Response(opts.body, { status: opts.status, headers });
}

describe("parseRetryAfter", () => {
  it("null → 1000ms default", () => {
    expect(parseRetryAfter(null)).toBe(1000);
  });
  it("delta-seconds → ms, capped at 5000", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("10")).toBe(5000);
  });
  it("HTTP-date → delta-from-now, capped", () => {
    const future = new Date(Date.now() + 3000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(5000);
  });
  it("garbage → 1000ms default", () => {
    expect(parseRetryAfter("not a date")).toBe(1000);
  });
});

describe("pushSms — request shape", () => {
  it("POSTs form-urlencoded body with X-TXTBOX-Auth header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ status: 200, body: '{"success":true,"txn_id":"x"}' }),
    );
    await pushSms({
      apiKey: "k",
      to: "09175551234",
      message: "hi there",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ws-v2.txtbox.com/messaging/v1/sms/push");
    expect(init.method).toBe("POST");
    expect(init.headers["X-TXTBOX-Auth"]).toBe("k");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toContain("number=09175551234");
    expect(init.body).toContain("message=hi+there");
  });

  it("baseUrl override is respected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ status: 200, body: '{"success":true}' }),
    );
    await pushSms({
      apiKey: "k",
      to: "09175551234",
      message: "x",
      baseUrl: "https://staging.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://staging.example.com/messaging/v1/sms/push",
    );
  });
});

describe("pushSms — retry behavior", () => {
  it("429 triggers single retry; second success returns ok", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 429, body: "", retryAfter: "0" }))
      .mockResolvedValueOnce(
        mockResponse({ status: 200, body: '{"success":true,"txn_id":"y"}' }),
      );
    const r = await pushSms({
      apiKey: "k",
      to: "09175551234",
      message: "x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("two 429s in a row → TxtboxRateLimitError", async () => {
    // Each call returns a fresh Response so its body isn't already-consumed.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () =>
        mockResponse({ status: 429, body: "", retryAfter: "0" }),
      );
    await expect(
      pushSms({
        apiKey: "k",
        to: "09175551234",
        message: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TxtboxRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("5xx is NOT retried; surfaces TxtboxApiError immediately", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 503, body: "down" }));
    await expect(
      pushSms({
        apiKey: "k",
        to: "09175551234",
        message: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TxtboxApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("401 → TxtboxAuthError", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 401, body: "" }));
    await expect(
      pushSms({
        apiKey: "k",
        to: "09175551234",
        message: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TxtboxAuthError);
  });

  it("aborts on timeout", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    await expect(
      pushSms({
        apiKey: "k",
        to: "09175551234",
        message: "x",
        timeoutMs: 50,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
  });
});
