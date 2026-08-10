import type { UserSearchQuery } from "@flowledger/shared";
import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { getCurrentUser, searchUsers } from "../services/read.service.js";

/** Searches app users by name/email (excluding the requester) for pickers like group-member and shared-expense-participant search. */
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
