import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { authenticateUser, getCurrentUser } from "../services/read.service.js";
import { buildRefreshTokenCookie } from "../utils/refreshTokenCookie.js";

/** Authenticates a user by email/password, sets the refresh token cookie, and responds with an access token and the public user record. */
export async function login(req: Request, res: Response) {
  const { token, refreshToken, user } = await authenticateUser(req.body);
  res.setHeader(
    "Set-Cookie",
    buildRefreshTokenCookie(refreshToken.token, refreshToken.expiresAt)
  );
  res.json({ token, user: publicUser(user) });
}

/** Returns the authenticated user's public profile. */
export async function getMe(req: Request, res: Response) {
  const user = await getCurrentUser(req.user!.id);
  res.json({ user: publicUser(user) });
}
