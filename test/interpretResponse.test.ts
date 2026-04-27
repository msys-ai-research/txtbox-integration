import { describe, it, expect } from "vitest";
import { interpretResponse } from "../src/txtbox/interpretResponse.js";
import {
  TxtboxApiError,
  TxtboxAuthError,
  TxtboxRateLimitError,
} from "../src/txtbox/errors.js";

describe("interpretResponse", () => {
  it("401 → TxtboxAuthError", () => {
    expect(() => interpretResponse(401, '{"any":"thing"}', null)).toThrow(
      TxtboxAuthError,
    );
  });

  it("403 → TxtboxAuthError", () => {
    expect(() => interpretResponse(403, "", null)).toThrow(TxtboxAuthError);
  });

  it("429 → TxtboxRateLimitError carries retryAfter", () => {
    try {
      interpretResponse(429, '{"x":1}', "5");
      throw new Error("should not reach");
    } catch (e) {
      expect(e).toBeInstanceOf(TxtboxRateLimitError);
      expect((e as TxtboxRateLimitError).retryAfter).toBe("5");
    }
  });

  it("500 with success:true is STILL an error (regression)", () => {
    expect(() =>
      interpretResponse(500, '{"success":true,"txn_id":"x"}', null),
    ).toThrow(TxtboxApiError);
  });

  it("500 with HTML → TxtboxApiError", () => {
    expect(() =>
      interpretResponse(503, "<html><body>maintenance</body></html>", null),
    ).toThrow(TxtboxApiError);
  });

  it("200 with non-JSON text → TxtboxApiError (regression)", () => {
    expect(() =>
      interpretResponse(200, "<html>cdn error page</html>", null),
    ).toThrow(/non-JSON 2xx/);
  });

  it("200 with success:false → TxtboxApiError uses message", () => {
    try {
      interpretResponse(
        200,
        JSON.stringify({ success: false, message: "Insufficient Credits" }),
        null,
      );
      throw new Error("should not reach");
    } catch (e) {
      expect(e).toBeInstanceOf(TxtboxApiError);
      expect((e as Error).message).toBe("Insufficient Credits");
    }
  });

  it("200 with errors:{} non-empty → TxtboxApiError uses message", () => {
    try {
      interpretResponse(
        200,
        JSON.stringify({
          success: false,
          message: "Unprocessable Entity",
          errors: { number: ["required"] },
        }),
        null,
      );
      throw new Error("should not reach");
    } catch (e) {
      expect(e).toBeInstanceOf(TxtboxApiError);
      expect((e as Error).message).toBe("Unprocessable Entity");
    }
  });

  it("200 with success:true → ok with txnId", () => {
    const r = interpretResponse(
      200,
      JSON.stringify({ success: true, txn_id: "abc123" }),
      null,
    );
    expect(r.ok).toBe(true);
    expect(r.txnId).toBe("abc123");
  });

  it("200 with success:true and data.id → txnId from data.id", () => {
    const r = interpretResponse(
      200,
      JSON.stringify({ success: true, data: { id: "nested" } }),
      null,
    );
    expect(r.txnId).toBe("nested");
  });

  it("422 with errors → TxtboxApiError", () => {
    expect(() =>
      interpretResponse(
        422,
        JSON.stringify({ errors: { number: ["invalid"] } }),
        null,
      ),
    ).toThrow(TxtboxApiError);
  });

  it("400 with JSON message but no app-failure marker → TxtboxApiError", () => {
    expect(() =>
      interpretResponse(400, JSON.stringify({ message: "bad request" }), null),
    ).toThrow("bad request");
  });

  it("200 with empty errors object is NOT an app failure", () => {
    const r = interpretResponse(
      200,
      JSON.stringify({ success: true, errors: {} }),
      null,
    );
    expect(r.ok).toBe(true);
  });
});
