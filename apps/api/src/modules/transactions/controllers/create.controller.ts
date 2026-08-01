import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import type { ImportedTransactionSelection } from "../types/transactions.types.js";
import {
  batchImportProviderImportedTransactions,
  createTransaction,
  importProviderImportedTransaction
} from "../services/create.service.js";

export async function postTransaction(req: Request, res: Response) {
  const transaction = await createTransaction(req.user!.id, req.body);
  res.status(201).json({ transaction: serialize(transaction) });
}

export async function postImportedTransactionImport(
  req: Request,
  res: Response
) {
  const importedTransactionId = req.params.id;
  if (!importedTransactionId) throw notFound("Imported transaction");

  const importedTransaction = await importProviderImportedTransaction({
    id: importedTransactionId,
    userId: req.user!.id,
    categoryId: req.body.categoryId
  });

  res.status(201).json({ importedTransaction: serialize(importedTransaction) });
}

export async function postBatchImport(req: Request, res: Response) {
  const selection = req.body.selection as ImportedTransactionSelection;
  const batchCategoryId = req.body.categoryId as string | undefined;
  const result = await batchImportProviderImportedTransactions(req.user!.id, {
    selection,
    categoryId: batchCategoryId
  });

  res.status(201).json({
    importedTransactions: serialize(result.importedTransactions),
    importedCount: result.importedCount,
    errors: result.errors
  });
}
