import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { listApiKeys } from "../services/read.service.js";

/** Lists the caller's API keys. */
export async function getApiKeys(req: Request, res: Response) {
  const apiKeys = await listApiKeys(req.user!.id);
  res.json({ apiKeys: serialize(apiKeys) });
}
