import type { Request, Response } from "express";
import { revokeOAuthGrant } from "../services/delete.service.js";

/** Revokes one of the caller's connected apps. */
export async function deleteOAuthGrant(req: Request, res: Response) {
  await revokeOAuthGrant(req.user!.id, req.params.id!);
  res.status(204).send();
}
