/** Minimal shared-expense-participant shape needed to derive who owes whom. */
export type DebtDirectionInput = {
  userId: string | null;
  sharedExpense: {
    ownerUserId: string;
    transaction: {
      type: "income" | "expense" | "transfer";
    };
  };
};

/** Resolved debtor/creditor pair for a debt, or `null` for a non-shareable (transfer) transaction. */
export type DebtDirection = {
  debtorUserId: string | null;
  creditorUserId: string | null;
};
