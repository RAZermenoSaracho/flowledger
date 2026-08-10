import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { listDebts } from "../services/read.service.js";

/** Returns the caller's debts (owed-to-me and i-owe), balances, and settlement requests. */
export async function getDebts(req: Request, res: Response) {
  const result = await listDebts(req.user!.id);
  res.json(serialize(result));
}
