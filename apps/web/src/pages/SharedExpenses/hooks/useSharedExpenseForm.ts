import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as sharedExpensesClient from "../../../services/sharedExpenses.client";
import type { FormErrors } from "../../../types/common.types";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import type { SharedExpenseDraft } from "../types/sharedExpenses.types";

const TITLE_MAX_LENGTH = 160;

function validate(values: SharedExpenseDraft): FormErrors {
  const title = values.title.trim();
  if (!title) return { title: "Title is required" };
  if (title.length > TITLE_MAX_LENGTH)
    return { title: `Title must be at most ${TITLE_MAX_LENGTH} characters` };
  return {};
}

/**
 * Shared-expense adapter over `useFormDraft`: `initial` comes from the record (`null` while it
 * loads), `save` sends one `PUT /shared-expenses/:id` with the changed keys only and then
 * invalidates every query a title or status change can reach.
 */
export function useSharedExpenseForm(sharedExpense: SharedExpense | null) {
  const queryClient = useQueryClient();

  const initial = useMemo<SharedExpenseDraft | null>(
    () =>
      sharedExpense && {
        title: sharedExpense.title,
        status: sharedExpense.status
      },
    [sharedExpense]
  );

  return useFormDraft<SharedExpenseDraft>({
    initial,
    validate,
    save: async (values, changedKeys) => {
      if (!sharedExpense) return;
      const body: Parameters<typeof sharedExpensesClient.updateSharedExpense>[1] = {};
      if (changedKeys.includes("title")) body.title = values.title.trim();
      if (changedKeys.includes("status")) body.status = values.status;
      await sharedExpensesClient.updateSharedExpense(sharedExpense.id, body);
      await Promise.all(
        ["shared-expenses", "shared-expense", "debts", "transactions", "notifications"].map(
          (key) => queryClient.invalidateQueries({ queryKey: [key] })
        )
      );
    }
  });
}
