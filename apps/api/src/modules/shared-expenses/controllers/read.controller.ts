import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getSharedExpenseById, listSharedExpenses } from "../services/read.service.js";

/** Lists shared expenses the caller owns or participates in, per a DSQL query. */
export async function getSharedExpenses(req: Request, res: Response) {
  const sharedExpenses = await listSharedExpenses(
    req.user!.id,
    req.query.query as string | undefined
  );
  res.json({ sharedExpenses: serialize(sharedExpenses) });
}

/** Fetches one shared expense by id, if the caller owns it or participates in it. */
export async function getSharedExpense(req: Request, res: Response) {
  const sharedExpense = await getSharedExpenseById(req.user!.id, req.params.id!);
  res.json({ sharedExpense: serialize(sharedExpense) });
}
