import {
  createTransaction,
  getFieldError,
  updateTransaction
} from "../../../services/transactions.client";
import type { Transaction } from "../../../types/transactions.types";
import { transactionDateRequestValue } from "../../../utils/dateTime";
import type { TransactionDraft } from "../types/transactions.types";

/** Error thrown by `saveTransactionDraft`; `field` is the draft key a server rule failure belongs to, so the draft hook shows it on that field. */
export class TransactionSaveError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
  }
}

function coreFields(draft: TransactionDraft) {
  const isTransfer = draft.type === "transfer";
  return {
    name: draft.name,
    amount: Number(draft.amount),
    executionCurrency: draft.executionCurrency,
    type: draft.type,
    accountId: draft.accountId || null,
    transferToAccountId: isTransfer ? draft.transferToAccountId || null : null,
    categoryId: isTransfer ? null : draft.categoryId || null,
    groupId: isTransfer ? null : draft.groupId || null,
    notes: draft.notes || null
  };
}

/** Body of `POST /transactions`: every field, `date` as a UTC instant, and the nested `sharedExpense` when the draft is a shared income/expense. */
export function buildCreateBody(draft: TransactionDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...coreFields(draft),
    date: transactionDateRequestValue(draft.date)
  };
  if (draft.isShared && draft.type !== "transfer") {
    body.sharedExpense = {
      title: draft.sharedTitle || draft.name,
      participants: draft.participants.map((participant) => ({
        userId: participant.userId ?? null,
        participantName: participant.participantName,
        shareAmount: Number(participant.shareAmount),
        paidAmount: 0,
        status: "pending"
      }))
    };
  }
  return body;
}

/**
 * Body of `PUT /transactions/:id`: only the changed core fields. `date` is sent only when changed
 * (keeping the stored seconds), and a type change also sends the fields the type couples to.
 * Sharing keys are never sent for an existing transaction.
 */
export function buildUpdateBody(
  draft: TransactionDraft,
  changedKeys: string[],
  original: Pick<Transaction, "date">
): Record<string, unknown> {
  const fields = coreFields(draft);
  const keys = new Set(changedKeys);
  if (keys.has("type")) {
    keys.add("transferToAccountId");
    keys.add("categoryId");
    keys.add("groupId");
  }
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (keys.has(key)) body[key] = fields[key];
  }
  if (keys.has("date")) {
    const date = transactionDateRequestValue(draft.date, original);
    if (date !== undefined) body.date = date;
  }
  return body;
}

/**
 * Persists a draft with exactly one request: `POST /transactions` when `original` is `null`,
 * otherwise `PUT /transactions/:id` with the changed fields. Returns the saved transaction. A
 * server rule failure naming a field rejects with a `TransactionSaveError` carrying that field
 * (`sharedExpense` maps to `participants`); any failure leaves the server unchanged.
 */
export async function saveTransactionDraft({
  draft,
  changedKeys,
  original
}: {
  draft: TransactionDraft;
  changedKeys: string[];
  original: Transaction | null;
}): Promise<Transaction> {
  try {
    const response = original
      ? await updateTransaction(original.id, buildUpdateBody(draft, changedKeys, original))
      : await createTransaction(buildCreateBody(draft));
    return response.transaction;
  } catch (error) {
    const fieldError = getFieldError(error);
    if (fieldError) {
      throw new TransactionSaveError(
        fieldError.message,
        fieldError.field === "sharedExpense" ? "participants" : fieldError.field
      );
    }
    throw error;
  }
}
