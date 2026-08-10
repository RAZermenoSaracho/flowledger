import type { SharedExpenseInput } from "@flowledger/shared";
import type { SharedExpenseStatus } from "@prisma/client";
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
