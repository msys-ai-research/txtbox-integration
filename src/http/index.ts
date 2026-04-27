import { createApp } from "./server.js";
import { logger } from "../util/logger.js";

const port = Number.parseInt(process.env["PORT"] ?? "3000", 10);

const app = createApp();
const server = app.listen(port, () => {
  logger.info({ msg: "txtbox-mcp listening", port, transport: "http" });
});

function shutdown(signal: string): void {
  logger.info({ msg: "shutdown", signal });
  server.close(() => {
    process.exit(0);
  });
  // Hard timeout — Railway gives ~10s grace before SIGKILL.
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
