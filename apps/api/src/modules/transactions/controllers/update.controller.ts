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

export async function postBatchIgnore(req: Request, res: Response) {
  const selection = req.body.selection as ImportedTransactionSelection;
  const result = await batchIgnoreImportedTransactions(
    req.user!.id,
    selection
  );

  res.json({ ignoredCount: result, errors: [] });
}

export async function postBatchUnignore(req: Request, res: Response) {
  const selection = req.body.selection as ImportedTransactionSelection;
  const result = await batchUnignoreImportedTransactions(
    req.user!.id,
    selection
  );

  res.json({ unignoredCount: result, errors: [] });
}

export async function putTransaction(req: Request, res: Response) {
  const transaction = await updateTransaction(
    req.user!.id,
    req.params.id!,
    req.body
  );
  res.json({ transaction: serialize(transaction) });
}
