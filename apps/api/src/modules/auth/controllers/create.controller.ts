import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { registerUser } from "../services/create.service.js";
import { buildSessionCookies } from "../utils/refreshTokenCookie.js";

/** Registers a new user from `req.body`, sets the refresh token cookie, and responds with an access token and the public user record. */
export async function register(req: Request, res: Response) {
  const { token, refreshToken, user } = await registerUser(req.body);
  res.setHeader("Set-Cookie", buildSessionCookies(refreshToken));
  res.status(201).json({ token, user: publicUser(user) });
}
