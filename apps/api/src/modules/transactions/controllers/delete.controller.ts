import type { Request, Response } from "express";
import { deleteTransaction } from "../services/delete.service.js";

/** Deletes a transaction owned by the authenticated user, cascading any related shared-expense data. */
export async function deleteTransactionHandler(req: Request, res: Response) {
  await deleteTransaction(req.user!.id, req.params.id!);
  res.status(204).send();
}
