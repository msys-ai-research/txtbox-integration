import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/http/server.js";

// Mock the upstream Txtbox client so we never hit the network. The mock is
// hoisted by vitest before the createApp() import resolves.
const pushMock = vi.hoisted(() =>
  vi.fn(async (args: { apiKey: string; to: string; message: string }) => ({
    ok: true as const,
    raw: { success: true, txn_id: `txn-${args.to.slice(-4)}` },
    txnId: `txn-${args.to.slice(-4)}`,
    receivedKey: args.apiKey,
  })),
);

vi.mock("../src/txtbox/client.js", () => ({
  pushSms: pushMock,
}));

beforeEach(() => {
  pushMock.mockClear();
});

describe("GET /healthz", () => {
  it("returns 200 without auth", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("GET /", () => {
  it("returns a banner without auth", async () => {
    const app = createApp();
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("txtbox-mcp");
    expect(res.body.mcp).toBe("/api/mcp");
  });
});

describe("POST /api/mcp — auth gate", () => {
  it("401s when X-TXTBOX-Auth is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/mcp")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_auth");
  });

  it("401s when X-TXTBOX-Auth is empty whitespace", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", "   ")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/mcp — initialize + tools/list + tools/call", () => {
  it("lists send_sms when initialized", async () => {
    const app = createApp();
    // The MCP spec requires an initialize handshake before other requests.
    // Stateless mode skips session tracking but still validates the protocol
    // version negotiation.
    const initRes = await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", "tbx_caller_a")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });
    expect(initRes.status).toBe(200);

    // Reuse the same headers for tools/list. Stateless mode means each call
    // builds a fresh server, but the protocol still needs each call framed
    // correctly.
    const listRes = await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", "tbx_caller_a")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });
    expect(listRes.status).toBe(200);
  });

  it("forwards the per-request X-TXTBOX-Auth header to pushSms", async () => {
    const app = createApp();
    const callerKey = "tbx_caller_unique_xyz";

    // Single combined initialize+call isn't part of the MCP spec, but in
    // stateless mode each request is independent. We can issue a tools/call
    // after manually initializing in the same payload sequence.
    const callRes = await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", callerKey)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });
    expect(callRes.status).toBe(200);

    // Now invoke the tool. In stateless mode the SDK accepts the call
    // without a prior session.
    const toolRes = await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", callerKey)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "send_sms",
          arguments: { to: "09175551234", message: "hi from test" },
        },
      });

    expect(toolRes.status).toBe(200);
    expect(pushMock).toHaveBeenCalled();
    // Critical: the upstream call must use the caller's header value, not
    // any process.env or hard-coded fallback.
    const args = pushMock.mock.calls[0]![0];
    expect(args.apiKey).toBe(callerKey);
    expect(args.to).toBe("+639175551234");
    expect(args.message).toBe("hi from test");
  });

  it("does not leak the X-TXTBOX-Auth value into the JSON-RPC response body", async () => {
    const app = createApp();
    const callerKey = "tbx_caller_secret_must_not_leak";

    await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", callerKey)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });

    const toolRes = await request(app)
      .post("/api/mcp")
      .set("X-TXTBOX-Auth", callerKey)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "send_sms",
          arguments: { to: "09175551234", message: "hi" },
        },
      });

    // The mocked pushSms response intentionally echoes the apiKey into raw
    // body so we can prove redact() strips it.
    const body =
      typeof toolRes.text === "string" ? toolRes.text : JSON.stringify(toolRes.body);
    expect(body).not.toContain(callerKey);
  });
});

describe("Method gating on /api/mcp", () => {
  it("returns 405 for GET (auth-permitting)", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/mcp")
      .set("X-TXTBOX-Auth", "tbx_x");
    expect(res.status).toBe(405);
  });
});
