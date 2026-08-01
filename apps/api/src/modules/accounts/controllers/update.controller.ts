import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  archiveAccount,
  restoreAccount,
  updateAccount
} from "../services/update.service.js";

export async function putAccount(req: Request, res: Response) {
  const account = await updateAccount(req.user!.id, req.params.id!, req.body);
  res.json({ account: serialize(account) });
}

export async function postArchiveAccount(req: Request, res: Response) {
  const account = await archiveAccount(req.user!.id, req.params.id!);
  res.json({ account: serialize(account) });
}

export async function postRestoreAccount(req: Request, res: Response) {
  const account = await restoreAccount(req.user!.id, req.params.id!);
  res.json({ account: serialize(account) });
}
