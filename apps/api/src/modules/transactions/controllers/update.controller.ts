import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import type { ImportedTransactionSelection } from "../types/transactions.types.js";
import {
  batchIgnoreImportedTransactions,
  batchUnignoreImportedTransactions,
  ignoreImportedTransaction,
  unignoreImportedTransaction,
  updateImportedTransactionCategory,
  updateTransaction
} from "../services/update.service.js";

/** Updates the category on a pending imported transaction. */
export async function patchImportedTransaction(req: Request, res: Response) {
  const importedTransactionId = req.params.id;
  if (!importedTransactionId) throw notFound("Imported transaction");

  const importedTransaction = await updateImportedTransactionCategory(
    req.user!.id,
    importedTransactionId,
    req.body
  );

  res.json({ importedTransaction: serialize(importedTransaction) });
}

/** Marks an imported transaction as ignored so it's excluded from the pending review list. */
export async function postIgnoreImportedTransaction(
  req: Request,
  res: Response
) {
  const importedTransactionId = req.params.id;
  if (!importedTransactionId) throw notFound("Imported transaction");

  const result = await ignoreImportedTransaction(
    req.user!.id,
    importedTransactionId
  );

  res.json({ importedTransaction: serialize(result) });
}

/** Reverts an ignored imported transaction back to pending review. */
export async function postUnignoreImportedTransaction(
  req: Request,
  res: Response
) {
  const importedTransactionId = req.params.id;
  if (!importedTransactionId) throw notFound("Imported transaction");

  const result = await unignoreImportedTransaction(
    req.user!.id,
    importedTransactionId
  );

  res.json({ importedTransaction: serialize(result) });
}

/** Ignores a batch/selection of imported transactions. */
export async function postBatchIgnore(req: Request, res: Response) {
  const selection = req.body.selection as ImportedTransactionSelection;
  const result = await batchIgnoreImportedTransactions(
    req.user!.id,
    selection
  );

  res.json({ ignoredCount: result, errors: [] });
}

/** Un-ignores a batch/selection of imported transactions, reverting them to pending. */
export async function postBatchUnignore(req: Request, res: Response) {
  const selection = req.body.selection as ImportedTransactionSelection;
  const result = await batchUnignoreImportedTransactions(
    req.user!.id,
    selection
  );

  res.json({ unignoredCount: result, errors: [] });
}

/** Updates a transaction's fields, keeping any linked shared-expense data in sync. */
export async function putTransaction(req: Request, res: Response) {
  const transaction = await updateTransaction(
    req.user!.id,
    req.params.id!,
    req.body
  );
  res.json({ transaction: serialize(transaction) });
}
