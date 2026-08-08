import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { createSharedExpense } from "../services/create.service.js";

/** Creates a shared expense for a transaction the caller owns. */
export async function postSharedExpense(req: Request, res: Response) {
  const sharedExpense = await createSharedExpense(req.user!.id, req.body);
  res.status(201).json({ sharedExpense: serialize(sharedExpense) });
}
