import type { Request, Response } from "express";
import { unblockUser } from "../services/delete.service.js";

/** Removes the caller's block on the user in `:userId`; idempotent. */
export async function deleteBlock(req: Request, res: Response) {
  await unblockUser(req.user!.id, req.params.userId!);
  res.status(204).send();
}
