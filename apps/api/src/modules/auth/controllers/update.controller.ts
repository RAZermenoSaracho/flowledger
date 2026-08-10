import type { Request, Response } from "express";
import { HttpError } from "../../../utils/httpError.js";
import { publicUser } from "../../../utils/serialize.js";
import { rotateRefreshToken } from "../services/update.service.js";
import {
  buildRefreshTokenCookie,
  readRefreshTokenCookie
} from "../utils/refreshTokenCookie.js";

/** Reads the refresh token cookie, rotates it, and responds with a fresh access token and the public user record; throws 401 if the cookie is missing or the refresh token is invalid. */
export async function refresh(req: Request, res: Response) {
  const plaintextRefreshToken = readRefreshTokenCookie(req.headers.cookie);

  if (!plaintextRefreshToken) {
    throw new HttpError(401, "No refresh token");
  }

  const { token, refreshToken, user } = await rotateRefreshToken(
    plaintextRefreshToken
  );

  res.setHeader(
    "Set-Cookie",
    buildRefreshTokenCookie(refreshToken.token, refreshToken.expiresAt)
  );
  res.json({ token, user: publicUser(user) });
}
