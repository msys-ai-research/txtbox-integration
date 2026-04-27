import type { Request, Response, NextFunction } from "express";

export const AUTH_HEADER = "x-txtbox-auth";

export function requireTxtboxAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.header(AUTH_HEADER);
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) {
    res.status(401).json({
      error: "missing_auth",
      message:
        "X-TXTBOX-Auth header is required. Set it in your MCP client config: " +
        '"headers": { "X-TXTBOX-Auth": "<your-txtbox-api-key>" }.',
    });
    return;
  }
  res.locals["apiKey"] = key;
  next();
}
