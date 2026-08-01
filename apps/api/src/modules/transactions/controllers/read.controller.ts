import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import type { ImportedTransactionFilters } from "../types/transactions.types.js";
import {
  getImportedTransactionsPendingCount,
  getTransactionById,
  getTransactionsSummary,
  listImportedTransactions,
  listTransactions,
  type TransactionListFilters
} from "../services/read.service.js";

export async function getImportedTransactions(req: Request, res: Response) {
  const filters = req.query as ImportedTransactionFilters;
  const result = await listImportedTransactions(req.user!.id, filters);

  res.json({
    importedTransactions: serialize(result.importedTransactions),
    total: result.total,
    pendingCount: result.pendingCount
  });
}

export async function getImportedTransactionsPendingCountHandler(
  req: Request,
  res: Response
) {
  const count = await getImportedTransactionsPendingCount(req.user!.id);
  res.json({ count });
}

export async function getTransactions(req: Request, res: Response) {
  const filters = req.query as unknown as TransactionListFilters;
  const [transactions, summary] = await Promise.all([
    listTransactions(req.user!.id, filters),
    getTransactionsSummary(req.user!.id, filters)
  ]);
  res.json({ transactions: serialize(transactions), summary });
}

export async function getTransaction(req: Request, res: Response) {
  const transaction = await getTransactionById(req.user!.id, req.params.id!);
  res.json({ transaction: serialize(transaction) });
}
