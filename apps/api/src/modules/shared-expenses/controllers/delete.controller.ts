import type { Request, Response } from "express";
import { deleteSharedExpense } from "../services/delete.service.js";

/** Deletes the shared expense identified by `req.params.id`, if owned by the caller. */
export async function deleteSharedExpenseController(req: Request, res: Response) {
  await deleteSharedExpense(req.user!.id, req.params.id!);
  res.status(204).send();
}
