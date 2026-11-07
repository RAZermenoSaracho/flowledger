import type { Request, Response } from "express";
import { revokeRefreshToken } from "../services/delete.service.js";
import {
  clearSessionCookies,
  readRefreshTokenCookie
} from "../utils/refreshTokenCookie.js";

/** Revokes the refresh token carried by the cookie (if any) and clears the session cookies; always succeeds so a stale/expired session can still be logged out. */
export async function logout(req: Request, res: Response) {
  const plaintextRefreshToken = readRefreshTokenCookie(req.headers.cookie);

  if (plaintextRefreshToken) {
    await revokeRefreshToken(plaintextRefreshToken);
  }

  res.setHeader("Set-Cookie", clearSessionCookies());
  res.status(204).send();
}
