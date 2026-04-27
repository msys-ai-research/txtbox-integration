import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logger, type LogLevel } from "../src/util/logger.js";

const FIXTURES = {
  apiKey: "tbx_super_secret_key_value_xyz",
  fullPhPhone: "09175551234",
  messageBody: "secret OTP 123456 do not share",
  fakeAuthHeader: "X-TXTBOX-Auth: tbx_super_secret_key_value_xyz",
};

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

let captured: string[];
let originalWrite: typeof process.stderr.write;

beforeEach(() => {
  captured = [];
  originalWrite = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: string | Uint8Array): boolean => {
    captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  process.env["TXTBOX_API_KEY"] = FIXTURES.apiKey;
  process.env["TXTBOX_LOG_LEVEL"] = "debug";
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = originalWrite;
  delete process.env["TXTBOX_LOG_LEVEL"];
});

describe("logger redaction matrix", () => {
  for (const level of LEVELS) {
    it(`${level} level: API key never leaks`, () => {
      logger[level]({ msg: "leak test", value: FIXTURES.apiKey });
      const out = captured.join("");
      expect(out).not.toContain(FIXTURES.apiKey);
    });

    it(`${level} level: full PH number is masked`, () => {
      logger[level]({ msg: "leak test", to: FIXTURES.fullPhPhone });
      const out = captured.join("");
      expect(out).not.toContain(FIXTURES.fullPhPhone);
    });

    it(`${level} level: header containing key is redacted`, () => {
      logger[level]({ msg: "leak test", header: FIXTURES.fakeAuthHeader });
      const out = captured.join("");
      expect(out).not.toContain(FIXTURES.apiKey);
    });

    it(`${level} level: caller-provided message bodies are redacted if they contain a PH number`, () => {
      const body = `${FIXTURES.messageBody} call back at ${FIXTURES.fullPhPhone}`;
      logger[level]({ msg: "leak test", body });
      const out = captured.join("");
      expect(out).not.toContain(FIXTURES.fullPhPhone);
    });
  }
});

describe("logger level gating", () => {
  it("info level suppresses debug entries", () => {
    process.env["TXTBOX_LOG_LEVEL"] = "info";
    captured.length = 0;
    logger.debug({ msg: "should be suppressed" });
    expect(captured.join("")).toBe("");
  });

  it("default level (no env) is info", () => {
    delete process.env["TXTBOX_LOG_LEVEL"];
    captured.length = 0;
    logger.debug({ msg: "suppressed" });
    expect(captured.join("")).toBe("");
    logger.info({ msg: "shown" });
    expect(captured.join("")).toContain("shown");
  });
});
