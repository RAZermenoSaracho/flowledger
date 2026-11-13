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
    amount: draft.amount.trim(),
    executionCurrency: draft.executionCurrency,
    type: draft.type,
    accountId: draft.accountId || null,
    transferToAccountId: isTransfer ? draft.transferToAccountId || null : null,
    categoryId: isTransfer ? null : draft.categoryId || null,
    groupId: isTransfer ? null : draft.groupId || null,
    notes: draft.notes || null
  };
}

/** Keys whose change (or whose coupled inputs' change) makes an update restate the applied amounts and fee, since the server revalidates them together. */
const APPLIED_AMOUNT_KEYS = [
  "amount",
  "executionCurrency",
  "accountId",
  "transferToAccountId",
  "type",
  "accountAmount",
  "destinationAmount",
  "feeAmount",
  "feeCurrency"
];

/** The applied-amount and fee fields the draft currently holds, as decimal strings; empty ones are omitted (equal currencies leave them to the server, a fee needs both halves). */
function appliedFields(draft: TransactionDraft) {
  const fee = draft.feeAmount.trim() && draft.feeCurrency;
  return {
    ...(draft.accountAmount.trim() ? { accountAmount: draft.accountAmount.trim() } : {}),
    ...(draft.destinationAmount.trim() ? { destinationAmount: draft.destinationAmount.trim() } : {}),
    ...(fee ? { feeAmount: draft.feeAmount.trim(), feeCurrency: draft.feeCurrency } : {})
  };
}

/** Body of `POST /transactions`: every field, `date` as a UTC instant, and the nested `sharedExpense` when the draft is a shared income/expense. */
export function buildCreateBody(draft: TransactionDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...coreFields(draft),
    ...appliedFields(draft),
    date: transactionDateRequestValue(draft.date)
  };
  if (draft.isShared && draft.type !== "transfer") {
    body.sharedExpense = {
      title: draft.sharedTitle || draft.name,
      participants: draft.participants.map((participant) => ({
        userId: participant.userId ?? null,
        participantName: participant.participantName,
        shareAmount: participant.shareAmount.trim(),
        paidAmount: "0",
        status: "pending"
      }))
    };
  }
  return body;
}

const SHARING_KEYS = ["isShared", "sharedTitle", "participants"];

/**
 * The `sharedExpense` update shape for a draft: the full participant list (stored rows by `id`,
 * app users by `userId`, others by `manualName`; payment and consent state are never sent), or
 * `{ enabled: false }` when sharing was turned off.
 */
export function buildSharedExpenseUpdate(draft: TransactionDraft): Record<string, unknown> {
  if (!draft.isShared || draft.type === "transfer") return { enabled: false };
  const title = draft.sharedTitle.trim();
  return {
    enabled: true,
    ...(title ? { title } : {}),
    participants: draft.participants.map((participant) => ({
      ...(participant.id ? { id: participant.id } : {}),
      ...(participant.userId
        ? { userId: participant.userId }
        : { manualName: participant.participantName }),
      share: participant.shareAmount.trim()
    }))
  };
}

/**
 * Body of `PUT /transactions/:id`: only the changed core fields. `date` is sent only when changed
 * (keeping the stored seconds), and a type change also sends the fields the type couples to, and emptying a stored fee sends `feeAmount: null, feeCurrency: null` to clear it. Any
 * sharing change sends the whole sharing state as `sharedExpense`, applied atomically with the rest.
 */
export function buildUpdateBody(
  draft: TransactionDraft,
  changedKeys: string[],
  original: Pick<Transaction, "date" | "feeAmount">
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
  if (changedKeys.some((key) => APPLIED_AMOUNT_KEYS.includes(key))) {
    Object.assign(body, appliedFields(draft));
    if (original.feeAmount != null && !("feeAmount" in body)) {
      body.feeAmount = null;
      body.feeCurrency = null;
    }
  }
  if (keys.has("date")) {
    const date = transactionDateRequestValue(draft.date, original);
    if (date !== undefined) body.date = date;
  }
  if (changedKeys.some((key) => SHARING_KEYS.includes(key))) {
    body.sharedExpense = buildSharedExpenseUpdate(draft);
  }
  return body;
}

/**
 * Maps a server field key to the draft key it is shown on: `sharedExpense.participants.<i>.share`
 * and `.id` to `participants.<i>.shareAmount`, every other `sharedExpense...` key (including
 * `removed.<i>`) to `participants`, anything else unchanged.
 */
export function draftFieldForServerField(field: string): string {
  const row = /^sharedExpense\.participants\.(\d+)\.(share|id)$/.exec(field);
  if (row) return `participants.${row[1]}.shareAmount`;
  return field.startsWith("sharedExpense") ? "participants" : field;
}

/**
 * Persists a draft with exactly one request: `POST /transactions` when `original` is `null`,
 * otherwise `PUT /transactions/:id` with the changed fields. Returns the saved transaction. A
 * server rule failure naming a field rejects with a `TransactionSaveError` carrying that field
 * (see `draftFieldForServerField`); any failure leaves the server unchanged.
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
        draftFieldForServerField(fieldError.field)
      );
    }
    throw error;
  }
}
