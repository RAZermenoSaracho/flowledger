import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { routes } from "../../../constants/routes";
import { useFormDraft } from "../../../hooks/useFormDraft";
import type { Transaction } from "../../../types/transactions.types";
import type { TransactionDraft } from "../types/transactions.types";
import { saveTransactionDraft } from "../utils/transactionSave";
import { validateTransactionDraft } from "../utils/transactionValidation";

const INVALIDATED_ON_SAVE = [
  "transactions",
  "transaction",
  "accounts",
  "groups",
  "summary",
  "cashflow",
  "shared-expenses",
  "debts",
  "notifications"
];

/**
 * Transaction adapter over `useFormDraft`. `initial` is the draft to start from (`null` while
 * loading) and `original` the stored transaction, or `null` for a new draft. Saving sends one
 * request (see `saveTransactionDraft`), invalidates every query a transaction feeds, and, for a
 * new draft, replaces the URL with the created transaction's view.
 */
export function useTransactionForm({
  initial,
  original
}: {
  initial: TransactionDraft | null;
  original: Transaction | null;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useFormDraft<TransactionDraft>({
    initial,
    validate: (values) => validateTransactionDraft(values, { validateSharing: !original }),
    save: async (values, changedKeys) => {
      const saved = await saveTransactionDraft({ draft: values, changedKeys, original });
      await Promise.all(
        INVALIDATED_ON_SAVE.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      );
      if (!original) navigate(routes.transaction(saved.id), { replace: true });
    }
  });
}
