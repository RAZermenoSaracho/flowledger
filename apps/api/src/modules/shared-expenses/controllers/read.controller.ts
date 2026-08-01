import type { SharedExpenseFilters } from "@flowledger/shared";
import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getSharedExpenseById, listSharedExpenses } from "../services/read.service.js";

export async function getSharedExpenses(req: Request, res: Response) {
  const filters = req.query as unknown as SharedExpenseFilters;
  const sharedExpenses = await listSharedExpenses(req.user!.id, filters);
  res.json({ sharedExpenses: serialize(sharedExpenses) });
}

export async function getSharedExpense(req: Request, res: Response) {
  const sharedExpense = await getSharedExpenseById(req.user!.id, req.params.id!);
  res.json({ sharedExpense: serialize(sharedExpense) });
}
