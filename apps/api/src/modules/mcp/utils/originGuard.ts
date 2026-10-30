import type { NextFunction, Request, Response } from "express";

/** Rejects any request carrying an `Origin` header (browsers always send one; CLI and server MCP clients never do), as DNS-rebinding defence. */
export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (req.header("origin")) {
    res.status(403).json({ message: "Origin not allowed" });
    return;
  }
  next();
}
