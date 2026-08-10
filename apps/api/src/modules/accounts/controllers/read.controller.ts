import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { listAccounts } from "../services/read.service.js";

/** Lists the authenticated user's accounts per a DSQL query. */
export async function getAccounts(req: Request, res: Response) {
  const accounts = await listAccounts(req.user!.id, req.query.query as string | undefined);
  res.json({ accounts: serialize(accounts) });
}
