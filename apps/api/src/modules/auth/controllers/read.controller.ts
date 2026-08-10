import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { authenticateUser, getCurrentUser } from "../services/read.service.js";

/** Authenticates a user by email/password and responds with a JWT and the public user record. */
export async function login(req: Request, res: Response) {
  const { token, user } = await authenticateUser(req.body);
  res.json({ token, user: publicUser(user) });
}

/** Returns the authenticated user's public profile. */
export async function getMe(req: Request, res: Response) {
  const user = await getCurrentUser(req.user!.id);
  res.json({ user: publicUser(user) });
}
