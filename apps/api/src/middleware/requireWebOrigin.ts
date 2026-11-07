import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Rejects a browser request whose `Origin` isn't the web app, before it can change a session.
 * Sibling subdomains are same-site, so `SameSite=Strict` alone doesn't stop them. Requests with
 * no `Origin` pass: browsers always send one on POST and PATCH, and server-side tools don't.
 */
export function requireWebOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.header("origin");

  if (origin && origin !== new URL(env.WEB_APP_URL).origin) {
    next(new HttpError(403, "Origin not allowed"));
    return;
  }

  next();
}
