import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SEND_SMS_NAME,
  SEND_SMS_DESCRIPTION,
  SendSmsInputShape,
  createSendSmsHandler,
} from "./tools/sendSms.js";

const NAME = "txtbox";
const VERSION = "0.2.0";

export interface BuildServerOpts {
  apiKey: string;
}

export function buildServer(opts: BuildServerOpts): McpServer {
  const server = new McpServer({ name: NAME, version: VERSION });

  const handler = createSendSmsHandler({ apiKey: opts.apiKey });
  server.tool(
    SEND_SMS_NAME,
    SEND_SMS_DESCRIPTION,
    SendSmsInputShape,
    handler,
  );

  return server;
}
