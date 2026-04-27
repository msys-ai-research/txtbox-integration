import { describe, it, expect } from "vitest";
import { pushSms } from "../src/txtbox/client.js";

const live =
  process.env["RUN_LIVE_INTEGRATION"] === "1" &&
  !!process.env["TXTBOX_API_KEY"] &&
  !!process.env["TXTBOX_TEST_RECIPIENT"];

describe.skipIf(!live)("live integration: sends a real SMS", () => {
  it("delivers to TXTBOX_TEST_RECIPIENT", async () => {
    const apiKey = process.env["TXTBOX_API_KEY"]!;
    const to = process.env["TXTBOX_TEST_RECIPIENT"]!;
    const stamp = new Date().toISOString();
    const r = await pushSms({
      apiKey,
      to,
      message: `txtbox-mcp integration test ${stamp}`,
    });
    expect(r.ok).toBe(true);
    // eslint-disable-next-line no-console
    process.stderr.write(
      `[integration] response shape: ${JSON.stringify(r.raw)}\n`,
    );
  }, 30_000);
});
