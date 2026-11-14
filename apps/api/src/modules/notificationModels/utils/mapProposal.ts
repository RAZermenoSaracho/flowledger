import type { NotificationProposal, TransactionInput } from "@flowledger/shared";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";

/** Proposal kinds that become a transaction (everything except `skip`). */
type TransactingProposal = Exclude<NotificationProposal, { kind: "skip" }>;

/** Outcome of {@link mapProposalToTransactionInput}: the input, or the first slot key that is unknown or unbound. */
export type MapProposalResult = { input: TransactionInput } | { missingSlot: string };

/**
 * Turns a validated script proposal into a `TransactionInput` per design §4, resolving slot keys through `bindings`.
 *
 * @param proposal - A non-skip proposal whose account/category/group fields are slot keys; omitted fields are never resolved and `executionCurrency` is left unset when `currency` is omitted.
 * @param bindings - Slot key to bound record id.
 * @param slots - The model's slot definitions; a referenced key must be declared here and bound.
 * @param receivedAt - Fallback `date` when the proposal has none.
 * @returns `{ input }`, unparsed by `transactionSchema` (callers parse it), or `{ missingSlot: key }` for the first
 *   referenced key that is undeclared, unbound, or declared with a different kind than its use.
 */
export function mapProposalToTransactionInput(
  proposal: TransactingProposal,
  bindings: ModelBindings,
  slots: ModelSlots,
  receivedAt: Date
): MapProposalResult {
  const resolve = (key: string, kind: "account" | "category" | "group") => {
    const slot = slots.find((s) => s.key === key);
    return slot && slot.kind === kind ? bindings[key] : undefined;
  };

  const references: Array<["accountId" | "transferToAccountId" | "categoryId" | "groupId", string, "account" | "category" | "group"]> = [];
  if (proposal.account) references.push(["accountId", proposal.account, "account"]);
  if (proposal.kind === "transfer") references.push(["transferToAccountId", proposal.to_account, "account"]);
  if (proposal.category) references.push(["categoryId", proposal.category, "category"]);
  if (proposal.group) references.push(["groupId", proposal.group, "group"]);

  const ids: Partial<Record<(typeof references)[number][0], string>> = {};
  for (const [field, key, kind] of references) {
    const id = resolve(key, kind);
    if (!id) return { missingSlot: key };
    ids[field] = id;
  }

  return {
    input: {
      name: proposal.name,
      amount: proposal.amount,
      type: proposal.kind,
      date: proposal.date ?? receivedAt.toISOString(),
      ...(proposal.currency ? { executionCurrency: proposal.currency } : {}),
      ...ids,
      ...(proposal.kind === "transfer" && proposal.destination_amount
        ? { destinationAmount: proposal.destination_amount }
        : {}),
      ...(proposal.notes ? { notes: proposal.notes } : {})
    }
  };
}

/** Message for a script result that fails `notificationProposalSchema`: `invalid result: <field path>: <first issue>`; shared by Playground and worker. */
export function invalidResultMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const issue = error.issues[0];
  const path = issue?.path.join(".");
  return `invalid result: ${path ? `${path}: ` : ""}${issue?.message ?? "invalid"}`;
}
