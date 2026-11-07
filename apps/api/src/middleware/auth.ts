import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/utils/tokens.js";
import { HttpError } from "../utils/httpError.js";

/** Validates the `Authorization: Bearer` access token and attaches `{ id, email }` to `req.user`; rejects with 401 if missing or invalid. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}
