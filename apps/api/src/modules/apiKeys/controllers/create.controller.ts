import type { CreateApiKeyInput } from "@flowledger/shared";
import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { createApiKey } from "../services/create.service.js";

/** Creates an API key; the only response that ever contains the plaintext `key`. */
export async function postApiKey(req: Request, res: Response) {
  const { apiKey, key } = await createApiKey(req.user!.id, req.body as CreateApiKeyInput);
  res.status(201).json({ apiKey: serialize(apiKey), key });
}
