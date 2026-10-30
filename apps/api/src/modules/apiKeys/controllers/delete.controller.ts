import type { Request, Response } from "express";
import { revokeApiKey } from "../services/delete.service.js";

/** Revokes one of the caller's API keys. */
export async function deleteApiKey(req: Request, res: Response) {
  await revokeApiKey(req.user!.id, req.params.id!);
  res.status(204).send();
}
