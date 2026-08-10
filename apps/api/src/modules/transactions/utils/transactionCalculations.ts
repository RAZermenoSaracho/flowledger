type TransactionType = "income" | "expense" | "transfer";

type AmountValue = number | { toNumber(): number };

type AccountBalanceTransaction = {
  accountId: string | null;
  transferToAccountId?: string | null;
  type: TransactionType;
  amount: AmountValue;
};

type CashflowTransaction = {
  date: Date;
  type: TransactionType;
  amount: AmountValue;
  categoryId?: string | null;
  expenseOffsetCategoryId?: string | null;
};

export const REPORT_TRANSACTION_TYPES = ["income", "expense"] as const;
type ReportTransactionType = (typeof REPORT_TRANSACTION_TYPES)[number];

function amountToNumber(amount: AmountValue) {
  return typeof amount === "number" ? amount : amount.toNumber();
}

function isReportTransactionType(
  type: TransactionType
): type is ReportTransactionType {
  return REPORT_TRANSACTION_TYPES.some((reportType) => reportType === type);
}

export function calculateAccountBalance(
  accountId: string,
  transactions: AccountBalanceTransaction[],
  initialBalance: AmountValue = 0
) {
  return transactions.reduce((balance, transaction) => {
    const amount = amountToNumber(transaction.amount);

    if (transaction.accountId === accountId) {
      if (transaction.type === "income") return balance + amount;
      if (transaction.type === "expense" || transaction.type === "transfer") {
        return balance - amount;
      }
    }

    if (
      transaction.type === "transfer" &&
      transaction.transferToAccountId === accountId
    ) {
      return balance + amount;
    }

    return balance;
  }, amountToNumber(initialBalance));
}

export function withAccountBalances<
  TAccount extends { id: string; initialBalance?: AmountValue }
>(accounts: TAccount[], transactions: AccountBalanceTransaction[]) {
  return accounts.map((account) => ({
    ...account,
    currentBalance: calculateAccountBalance(
      account.id,
      transactions,
      account.initialBalance ?? 0
    )
  }));
}

export function calculateMonthlyCashflow(
  transactions: CashflowTransaction[],
  filters: { categoryId?: string | null; categoryIds?: string[] | null } = {}
) {
  const categoryIds =
    filters.categoryIds && filters.categoryIds.length
      ? filters.categoryIds
      : filters.categoryId
        ? [filters.categoryId]
        : [];
  const categoryIdSet = new Set(categoryIds);
  const monthly = new Map<
    string,
    {
      month: string;
      income: number;
      expenses: number;
      grossExpenses: number;
      expenseReimbursements: number;
      netExpenses: number;
      grossIncome: number;
      incomeOffsets: number;
      netIncome: number;
      balance: number;
    }
  >();

  for (const transaction of transactions) {
    if (!isReportTransactionType(transaction.type)) {
      continue;
    }

    const month = transaction.date.toISOString().slice(0, 7);
    const row = monthly.get(month) ?? {
      month,
      income: 0,
      expenses: 0,
      grossExpenses: 0,
      expenseReimbursements: 0,
      netExpenses: 0,
      grossIncome: 0,
      incomeOffsets: 0,
      netIncome: 0,
      balance: 0
    };
    const amount = amountToNumber(transaction.amount);
    const matchesCategory =
      !categoryIdSet.size ||
      (transaction.categoryId
        ? categoryIdSet.has(transaction.categoryId)
        : false);
    const matchesOffsetCategory =
      !categoryIdSet.size ||
      (transaction.expenseOffsetCategoryId
        ? categoryIdSet.has(transaction.expenseOffsetCategoryId)
        : false);

    if (transaction.type === "income" && matchesCategory) {
      row.income += amount;
      row.grossIncome += amount;
    }
    if (
      transaction.type === "income" &&
      transaction.expenseOffsetCategoryId &&
      matchesOffsetCategory
    ) {
      row.expenseReimbursements += amount;
    }
    if (
      transaction.type === "income" &&
      transaction.expenseOffsetCategoryId &&
      matchesCategory
    ) {
      row.incomeOffsets += amount;
    }
    if (transaction.type === "expense" && matchesCategory) {
      row.expenses += amount;
      row.grossExpenses += amount;
    }

    row.netExpenses = row.grossExpenses - row.expenseReimbursements;
    row.netIncome = row.grossIncome - row.incomeOffsets;
    row.balance = row.income - row.expenses;
    monthly.set(month, row);
  }

  return [...monthly.values()];
}
