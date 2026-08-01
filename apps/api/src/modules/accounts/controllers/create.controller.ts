import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { createAccount } from "../services/create.service.js";

export async function postAccount(req: Request, res: Response) {
  const account = await createAccount(req.user!.id, req.body);
  res.status(201).json({ account: serialize(account) });
}
