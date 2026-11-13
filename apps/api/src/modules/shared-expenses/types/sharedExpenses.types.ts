import type { SharedExpenseInput } from "@flowledger/shared";
import type { Prisma, SharedExpenseStatus } from "@prisma/client";
import type { DataSieveQuery } from "datasieve";
import type { RawWhereNode } from "../../../db/sieve.types.js";

/** Element type of a shared-expense input's `participants` array. */
export type ParticipantInput = NonNullable<SharedExpenseInput["participants"]>[number];

/** Plain domain shape for `SharedExpense`, written for datasieve's generic inference (`DataSieveQuery<SharedExpenseListRecord>`). */
export interface SharedExpenseListRecord {
  id: string;
  transactionId: string;
  ownerUserId: string;
  title: string;
  totalAmount: number;
  status: SharedExpenseStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Untrusted shape of the decoded `query` request param for `GET /shared-expenses`.
 * Visibility (`ownerUserId = userId OR participants.some.userId = userId`)
 * can't be expressed in DSQL — the `participants` half is a to-many relation
 * filtered by a nested condition — so it's resolved server-side via a
 * precomputed id list before `where` is applied, same pattern as categories/groups.
 */
export type SharedExpensesQueryInput = {
  where?: RawWhereNode;
  sort?: DataSieveQuery<SharedExpenseListRecord>["sort"];
};

/** One participant as the sharing editor sends it: an existing row by `id`, an app user by `userId`, or a manual one by `manualName`. */
export type SharingParticipantInput = {
  id?: string;
  userId?: string | null;
  manualName?: string;
  share: string;
};

/** What {@link import("../services/apply.service.js").applySharedExpenseToTransaction} applies: disable sharing, or enable/edit it (omit `participants` to leave them untouched). */
export type SharingInput =
  | { enabled: false }
  | { enabled: true; title?: string; participants?: SharingParticipantInput[] };

/** A participant row with the settlement data the guards need. */
export type GuardParticipant = {
  id: string;
  participantName: string;
  acceptance: string;
  shareAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  settlementRequests: { status: string; amount: Prisma.Decimal }[];
};
