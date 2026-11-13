import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { routes } from "../../../constants/routes";
import { useFormDraft } from "../../../hooks/useFormDraft";
import type { Account } from "../../../types/accounts.types";
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
 * loading), `original` the stored transaction (or `null` for a new draft) and `accounts` the ones the cross-currency validation reads. Saving sends one
 * request (see `saveTransactionDraft`), invalidates every query a transaction feeds, and, for a
 * new draft, replaces the URL with the created transaction's view while preserving router state.
 */
export function useTransactionForm({
  initial,
  original,
  accounts = []
}: {
  initial: TransactionDraft | null;
  original: Transaction | null;
  accounts?: Account[];
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  return useFormDraft<TransactionDraft>({
    initial,
    validate: (values) => validateTransactionDraft(values, accounts),
    save: async (values, changedKeys) => {
      const saved = await saveTransactionDraft({ draft: values, changedKeys, original });
      await Promise.all(
        INVALIDATED_ON_SAVE.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      );
      if (!original) navigate(routes.transaction(saved.id), { replace: true, state: location.state });
    }
  });
}
