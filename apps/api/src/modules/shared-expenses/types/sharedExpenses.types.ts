import type { SharedExpenseInput } from "@flowledger/shared";

/** Element type of a shared-expense input's `participants` array. */
export type ParticipantInput = NonNullable<SharedExpenseInput["participants"]>[number];
