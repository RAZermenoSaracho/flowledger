import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { registerUser } from "../services/create.service.js";

/** Registers a new user from `req.body` and responds with a JWT and the public user record. */
export async function register(req: Request, res: Response) {
  const { token, user } = await registerUser(req.body);
  res.status(201).json({ token, user: publicUser(user) });
}
