import { describe, it, expect } from "vitest";
import { isPhMobile, normalize, toCanonical } from "../src/util/phone.js";

describe("phone.normalize", () => {
  it("strips whitespace, dashes, parens", () => {
    expect(normalize("(0917) 555-1234")).toBe("09175551234");
    expect(normalize("0917 555 1234")).toBe("09175551234");
    expect(normalize("+63 917-555-1234")).toBe("+639175551234");
  });
});

describe("phone.isPhMobile", () => {
  it("accepts 09XXXXXXXXX", () => {
    expect(isPhMobile("09175551234")).toBe(true);
  });
  it("accepts +639XXXXXXXXX", () => {
    expect(isPhMobile("+639175551234")).toBe(true);
  });
  it("accepts 639XXXXXXXXX", () => {
    expect(isPhMobile("639175551234")).toBe(true);
  });
  it("accepts numbers with separators", () => {
    expect(isPhMobile("(0917) 555-1234")).toBe(true);
    expect(isPhMobile("+63 917 555 1234")).toBe(true);
  });
  it("rejects landlines", () => {
    expect(isPhMobile("028123456")).toBe(false); // PH landline
  });
  it("rejects US numbers", () => {
    expect(isPhMobile("+14155551234")).toBe(false);
  });
  it("rejects too short", () => {
    expect(isPhMobile("091755512")).toBe(false);
  });
  it("rejects too long", () => {
    expect(isPhMobile("091755512345")).toBe(false);
  });
  it("rejects empty", () => {
    expect(isPhMobile("")).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isPhMobile("not a number")).toBe(false);
  });
  it("does NOT whitelist by prefix — accepts any 09XX block", () => {
    // PH NTC blocks change; shape-only validation must accept new blocks.
    expect(isPhMobile("09995551234")).toBe(true);
    expect(isPhMobile("09005551234")).toBe(true); // even technically-unallocated
  });
});

describe("phone.toCanonical", () => {
  it("09 → +639", () => {
    expect(toCanonical("09175551234")).toBe("+639175551234");
  });
  it("+639 → +639", () => {
    expect(toCanonical("+639175551234")).toBe("+639175551234");
  });
  it("639 → +639", () => {
    expect(toCanonical("639175551234")).toBe("+639175551234");
  });
  it("strips separators", () => {
    expect(toCanonical("(0917) 555-1234")).toBe("+639175551234");
  });
});
