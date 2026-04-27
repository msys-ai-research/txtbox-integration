import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSendSmsHandler } from "../src/tools/sendSms.js";
import {
  TxtboxApiError,
  TxtboxAuthError,
  TxtboxRateLimitError,
} from "../src/txtbox/errors.js";

const KEY = "tbx_test_key_xyz";

beforeEach(() => {
  delete process.env["TXTBOX_ALLOW_NON_PH"];
});

afterEach(() => {
  delete process.env["TXTBOX_ALLOW_NON_PH"];
});

describe("send_sms handler", () => {
  it("happy path returns a queued summary with masked recipient", async () => {
    const push = vi.fn().mockResolvedValue({
      ok: true,
      raw: { success: true, txn_id: "abc" },
      txnId: "abc",
    });
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "0917-555-1234", message: "hello" });
    expect(r.isError).toBeUndefined();
    const text = r.content[0]!.text;
    expect(text).toContain("SMS queued");
    expect(text).toContain("+639XX***1234");
    expect(text).toContain("segments=1");
    expect(text).toContain("txn_id=abc");
    expect(text).not.toContain("09175551234");
    // client received the per-request key + canonical PH form (international)
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: KEY, to: "+639175551234", message: "hello" }),
    );
  });

  it("rejects invalid PH phone client-side without calling client", async () => {
    const push = vi.fn();
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "+14155551234", message: "hi" });
    expect(r.isError).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("empty apiKey at construction surfaces a friendly error at call time", async () => {
    const push = vi.fn();
    const h = createSendSmsHandler({ apiKey: "   ", push });
    const r = await h({ to: "09175551234", message: "hi" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/X-TXTBOX-Auth/);
    expect(push).not.toHaveBeenCalled();
  });

  it("upstream auth error is reported as failure", async () => {
    const push = vi.fn().mockRejectedValue(new TxtboxAuthError("Auth failed (HTTP 401)"));
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "09175551234", message: "hi" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/SMS failed/);
    expect(r.content[0]!.text).toMatch(/Auth failed/);
  });

  it("api error message is surfaced and redacted", async () => {
    const push = vi
      .fn()
      .mockRejectedValue(new TxtboxApiError("Insufficient Credits"));
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "09175551234", message: "hi" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("Insufficient Credits");
  });

  it("rate-limit error is surfaced", async () => {
    const push = vi
      .fn()
      .mockRejectedValue(new TxtboxRateLimitError("Rate limited", "5"));
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "09175551234", message: "hi" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/Rate limited/);
  });

  it("allowNonPh:true alone (env unset) is rejected", async () => {
    const push = vi.fn();
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "+14155551234", message: "hi", allowNonPh: true });
    expect(r.isError).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("allowNonPh:true + env=1 forwards normalized non-PH number", async () => {
    process.env["TXTBOX_ALLOW_NON_PH"] = "1";
    const push = vi.fn().mockResolvedValue({
      ok: true,
      raw: { success: true },
    });
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "+1 (415) 555-1234", message: "hi", allowNonPh: true });
    expect(r.isError).toBeUndefined();
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+14155551234" }),
    );
  });

  it("multi-segment message reports correct segments count", async () => {
    const push = vi.fn().mockResolvedValue({ ok: true, raw: {} });
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const longMsg = "x".repeat(170);
    const r = await h({ to: "09175551234", message: longMsg });
    expect(r.content[0]!.text).toContain("segments=2");
  });

  it("response without txn_id omits the txn_id suffix", async () => {
    const push = vi.fn().mockResolvedValue({ ok: true, raw: { success: true } });
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "09175551234", message: "hi" });
    expect(r.content[0]!.text).not.toContain("txn_id=");
  });

  it("debug content block carries redacted raw response", async () => {
    const push = vi.fn().mockResolvedValue({
      ok: true,
      raw: { success: true, recipient: "09175551234" },
    });
    const h = createSendSmsHandler({ apiKey: KEY, push });
    const r = await h({ to: "09175551234", message: "hi" });
    expect(r.content[1]).toBeDefined();
    // PH number masked in debug too
    expect(r.content[1]!.text).not.toContain("09175551234");
  });
});
