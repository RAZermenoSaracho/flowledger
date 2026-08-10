import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  getImportedTransactionsPendingCount,
  getTransactionById,
  getTransactionsSummary,
  listImportedTransactions,
  listTransactions
} from "../services/read.service.js";

/** Lists provider-imported transactions matching the DSQL expression in the `query` query param, alongside total and pending counts. */
export async function getImportedTransactions(req: Request, res: Response) {
  const rawQuery = req.query.query as string | undefined;
  const result = await listImportedTransactions(req.user!.id, rawQuery);

  res.json({
    importedTransactions: serialize(result.importedTransactions),
    total: result.total,
    pendingCount: result.pendingCount
  });
}

/** Returns the count of the user's imported transactions still awaiting review. */
export async function getImportedTransactionsPendingCountHandler(
  req: Request,
  res: Response
) {
  const count = await getImportedTransactionsPendingCount(req.user!.id);
  res.json({ count });
}

/** Lists transactions matching the DSQL expression in the `query` query param. */
export async function getTransactions(req: Request, res: Response) {
  const rawQuery = req.query.query as string | undefined;
  const result = await listTransactions(req.user!.id, rawQuery);
  res.json({ data: serialize(result.data), meta: result.meta });
}

/** Returns income/expense/balance totals for transactions matching the DSQL expression in the `query` query param. */
export async function getTransactionsSummaryHandler(
  req: Request,
  res: Response
) {
  const rawQuery = req.query.query as string | undefined;
  const summary = await getTransactionsSummary(req.user!.id, rawQuery);
  res.json(summary);
}

/** Fetches one transaction by id, scoped to the authenticated user. */
export async function getTransaction(req: Request, res: Response) {
  const transaction = await getTransactionById(req.user!.id, req.params.id!);
  res.json({ transaction: serialize(transaction) });
}
