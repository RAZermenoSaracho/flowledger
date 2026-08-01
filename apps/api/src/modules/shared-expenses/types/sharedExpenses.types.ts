import type { SharedExpenseInput } from "@flowledger/shared";

export type ParticipantInput = NonNullable<SharedExpenseInput["participants"]>[number];
