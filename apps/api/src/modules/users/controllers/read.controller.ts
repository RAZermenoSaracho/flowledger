import type { UserSearchQuery, UsernameAvailabilityQuery } from "@flowledger/shared";
import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { getCurrentUser, isUsernameAvailable, listBlocks, searchUsers } from "../services/read.service.js";

/** Searches app users by username (exact, then prefix) for pickers like group-member and shared-expense-participant search; returns public identities only. */
export async function getUserSearch(req: Request, res: Response) {
  const { q, limit } = req.query as unknown as UserSearchQuery;
  const users = await searchUsers(req.user!.id, q, limit);
  res.json({ users });
}

/** Returns the authenticated user's own profile. */
export async function getMe(req: Request, res: Response) {
  const user = await getCurrentUser(req.user!.id);
  res.json({ user: publicUser(user) });
}

/** Reports whether a username is free for the caller to claim. */
export async function getUsernameAvailability(req: Request, res: Response) {
  const { username } = req.query as unknown as UsernameAvailabilityQuery;
  res.json({ username, available: await isUsernameAvailable(req.user!.id, username) });
}

/** Lists the caller's blocked users as public identities. */
export async function getBlocks(req: Request, res: Response) {
  res.json({ blocks: await listBlocks(req.user!.id) });
}
