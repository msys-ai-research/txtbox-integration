import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { maskPhNumber, redact } from "../src/util/redact.js";

describe("maskPhNumber", () => {
  it("masks 09 form preserving last 4 digits", () => {
    expect(maskPhNumber("09175551234")).toBe("09XX***1234");
  });
  it("masks +63 form", () => {
    expect(maskPhNumber("+639175551234")).toBe("+639XX***1234");
  });
  it("masks within longer text", () => {
    expect(maskPhNumber("call 09175551234 now")).toBe("call 09XX***1234 now");
  });
  it("masks multiple numbers in same string", () => {
    expect(maskPhNumber("a 09171111111 b 09182222222")).toBe(
      "a 09XX***1111 b 09XX***2222",
    );
  });
});

describe("redact", () => {
  const ORIG = process.env["TXTBOX_API_KEY"];
  beforeEach(() => {
    process.env["TXTBOX_API_KEY"] = "tbx_super_secret_key_value_xyz";
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env["TXTBOX_API_KEY"];
    else process.env["TXTBOX_API_KEY"] = ORIG;
  });

  it("strips API key from compound strings", () => {
    const out = redact("error: tbx_super_secret_key_value_xyz at line 1");
    expect(out).not.toContain("tbx_super_secret_key_value_xyz");
    expect(out).toContain("***REDACTED***");
  });

  it("strips API key from JSON-stringified objects", () => {
    const out = redact({ headers: { auth: "tbx_super_secret_key_value_xyz" } });
    expect(out).not.toContain("tbx_super_secret_key_value_xyz");
  });

  it("masks PH numbers in serialized output", () => {
    const out = redact({ to: "09175551234" });
    expect(out).not.toContain("09175551234");
    expect(out).toMatch(/09XX\*\*\*1234/);
  });

  it("handles Error instances safely", () => {
    const err = new Error("boom: tbx_super_secret_key_value_xyz / 09175551234");
    const out = redact(err);
    expect(out).not.toContain("tbx_super_secret_key_value_xyz");
    expect(out).not.toContain("09175551234");
  });

  it("works when API key env var is unset", () => {
    delete process.env["TXTBOX_API_KEY"];
    const out = redact("hello 09175551234");
    expect(out).toBe("hello 09XX***1234");
  });
});
