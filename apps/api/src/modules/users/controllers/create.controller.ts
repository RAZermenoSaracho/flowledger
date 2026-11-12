import type { BlockUserInput } from "@flowledger/shared";
import type { Request, Response } from "express";
import { blockUser } from "../services/create.service.js";

/** Blocks a user for the caller; idempotent. */
export async function postBlock(req: Request, res: Response) {
  const { userId } = req.body as BlockUserInput;
  res.status(201).json({ block: await blockUser(req.user!.id, userId) });
}
