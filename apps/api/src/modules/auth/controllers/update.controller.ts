import type { Request, Response } from "express";
import { HttpError } from "../../../utils/httpError.js";
import { publicUser } from "../../../utils/serialize.js";
import { rotateRefreshToken } from "../services/update.service.js";
import {
  buildSessionCookies,
  clearPresenceCookie,
  readRefreshTokenCookie
} from "../utils/refreshTokenCookie.js";

/**
 * Reads the refresh token cookie, rotates it, and responds with a fresh access token and the public user record; throws 401 if the cookie is missing or the refresh token is invalid.
 *
 * A 401 expires only the presence cookie. Clearing the refresh cookie could wipe a valid one another tab's rotation just set, while a lost presence cookie returns on the next successful refresh.
 */
export async function refresh(req: Request, res: Response) {
  const plaintextRefreshToken = readRefreshTokenCookie(req.headers.cookie);

  if (!plaintextRefreshToken) {
    res.setHeader("Set-Cookie", clearPresenceCookie());
    throw new HttpError(401, "No refresh token");
  }

  try {
    const { token, refreshToken, user } = await rotateRefreshToken(plaintextRefreshToken);

    res.setHeader("Set-Cookie", buildSessionCookies(refreshToken));
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 401) {
      res.setHeader("Set-Cookie", clearPresenceCookie());
    }
    throw error;
  }
}
