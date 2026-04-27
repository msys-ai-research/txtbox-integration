import express, { type Application, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "../server.js";
import { runWithApiKey } from "../util/requestContext.js";
import { logger } from "../util/logger.js";
import { requireTxtboxAuth } from "./auth.js";

export const MCP_PATH = "/api/mcp";

export function createApp(): Application {
  const app = express();

  // Behind Railway's proxy. Lets express trust X-Forwarded-* and emit
  // accurate req.protocol / req.ip values.
  app.set("trust proxy", 1);

  // MCP frames can exceed the default 100kb. Cap at 1mb as a DoS guard.
  app.use(express.json({ limit: "1mb" }));

  // Lightweight access log: method, path, status, duration. No bodies, no headers.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info({
        msg: "http",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - start,
      });
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "txtbox-mcp",
      transport: "http",
      mcp: MCP_PATH,
      docs: "https://www.txtbox.com/developers",
    });
  });

  app.post(MCP_PATH, requireTxtboxAuth, async (req: Request, res: Response) => {
    const apiKey = res.locals["apiKey"] as string;
    await runWithApiKey(apiKey, async () => {
      const mcpServer = buildServer({ apiKey });
      const transport = new StreamableHTTPServerTransport({
        // Stateless mode: no session affinity required. Each request gets a
        // fresh server + transport pair, torn down when the response closes.
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        logger.error({
          msg: "mcp_handle_failed",
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: "internal_error",
            message: "MCP request handling failed.",
          });
        }
      }
    });
  });

  // Reject other methods on /api/mcp explicitly so health probes and stray
  // GETs don't get routed through the MCP transport.
  app.all(MCP_PATH, (_req, res) => {
    res.status(405).json({
      error: "method_not_allowed",
      message: "Use POST for the MCP endpoint.",
    });
  });

  return app;
}
