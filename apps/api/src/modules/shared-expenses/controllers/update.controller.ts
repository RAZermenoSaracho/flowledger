import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { updateSharedExpense } from "../services/update.service.js";

export async function putSharedExpense(req: Request, res: Response) {
  const sharedExpense = await updateSharedExpense(
    req.user!.id,
    req.params.id!,
    req.body
  );
  res.json({ sharedExpense: serialize(sharedExpense) });
}
