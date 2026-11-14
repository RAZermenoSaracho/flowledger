import { Prisma } from "@prisma/client";

type TransactionType = "income" | "expense" | "transfer";

type AmountValue = Prisma.Decimal.Value;

type AccountBalanceTransaction = {
  accountId: string | null;
  transferToAccountId?: string | null;
  type: TransactionType;
  accountAmount: AmountValue | null;
  destinationAmount?: AmountValue | null;
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

function isReportTransactionType(
  type: TransactionType
): type is ReportTransactionType {
  return REPORT_TRANSACTION_TYPES.some((reportType) => reportType === type);
}

/**
 * The signed effect of one transaction on `accountId`'s native balance: income and transfer-in add
 * (`accountAmount` / `destinationAmount`), expense and transfer-out subtract `accountAmount`, and an unrelated transaction is zero.
 */
export function transactionBalanceDelta(
  transaction: AccountBalanceTransaction,
  accountId: string
): Prisma.Decimal {
  if (transaction.accountId === accountId) {
    const applied = new Prisma.Decimal(transaction.accountAmount ?? 0);
    if (transaction.type === "income") return applied;
    if (transaction.type === "expense" || transaction.type === "transfer") {
      return applied.negated();
    }
  }

  if (
    transaction.type === "transfer" &&
    transaction.transferToAccountId === accountId
  ) {
    return new Prisma.Decimal(transaction.destinationAmount ?? 0);
  }

  return new Prisma.Decimal(0);
}

/**
 * Computes an account's native balance with exact decimal arithmetic:
 * `initialBalance` plus the sum of {@link transactionBalanceDelta}.
 * A transfer fee is never subtracted here; the applied amounts already include its effect.
 */
export function calculateAccountBalance(
  accountId: string,
  transactions: AccountBalanceTransaction[],
  initialBalance: AmountValue = 0
): Prisma.Decimal {
  return transactions.reduce(
    (balance, transaction) =>
      balance.plus(transactionBalanceDelta(transaction, accountId)),
    new Prisma.Decimal(initialBalance)
  );
}

/** Attaches `currentBalance` (a `Prisma.Decimal`, see {@link calculateAccountBalance}) to each account. */
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

/**
 * Aggregates transactions into per-month cashflow buckets, optionally narrowed by category.
 * Months are bucketed in `timeZone` (an IANA name), defaulting to UTC. Sums are exact `Decimal`s; the returned figures are numbers.
 */
export function calculateMonthlyCashflow(
  transactions: CashflowTransaction[],
  filters: { categoryId?: string | null; categoryIds?: string[] | null } = {},
  timeZone = "UTC"
) {
  const monthFormat = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  });
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
      income: Prisma.Decimal;
      expenses: Prisma.Decimal;
      grossExpenses: Prisma.Decimal;
      expenseReimbursements: Prisma.Decimal;
      netExpenses: Prisma.Decimal;
      grossIncome: Prisma.Decimal;
      incomeOffsets: Prisma.Decimal;
      netIncome: Prisma.Decimal;
      balance: Prisma.Decimal;
    }
  >();

  for (const transaction of transactions) {
    if (!isReportTransactionType(transaction.type)) {
      continue;
    }

    const parts = monthFormat.formatToParts(transaction.date);
    const month = `${parts.find(({ type }) => type === "year")!.value}-${parts.find(({ type }) => type === "month")!.value}`;
    const row = monthly.get(month) ?? {
      month,
      income: new Prisma.Decimal(0),
      expenses: new Prisma.Decimal(0),
      grossExpenses: new Prisma.Decimal(0),
      expenseReimbursements: new Prisma.Decimal(0),
      netExpenses: new Prisma.Decimal(0),
      grossIncome: new Prisma.Decimal(0),
      incomeOffsets: new Prisma.Decimal(0),
      netIncome: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(0)
    };
    const amount = new Prisma.Decimal(transaction.amount);
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
      row.income = row.income.plus(amount);
      row.grossIncome = row.grossIncome.plus(amount);
    }
    if (
      transaction.type === "income" &&
      transaction.expenseOffsetCategoryId &&
      matchesOffsetCategory
    ) {
      row.expenseReimbursements = row.expenseReimbursements.plus(amount);
    }
    if (
      transaction.type === "income" &&
      transaction.expenseOffsetCategoryId &&
      matchesCategory
    ) {
      row.incomeOffsets = row.incomeOffsets.plus(amount);
    }
    if (transaction.type === "expense" && matchesCategory) {
      row.expenses = row.expenses.plus(amount);
      row.grossExpenses = row.grossExpenses.plus(amount);
    }

    row.netExpenses = row.grossExpenses.minus(row.expenseReimbursements);
    row.netIncome = row.grossIncome.minus(row.incomeOffsets);
    row.balance = row.income.minus(row.expenses);
    monthly.set(month, row);
  }

  return [...monthly.values()].map((row) => ({
    month: row.month,
    income: row.income.toNumber(),
    expenses: row.expenses.toNumber(),
    grossExpenses: row.grossExpenses.toNumber(),
    expenseReimbursements: row.expenseReimbursements.toNumber(),
    netExpenses: row.netExpenses.toNumber(),
    grossIncome: row.grossIncome.toNumber(),
    incomeOffsets: row.incomeOffsets.toNumber(),
    netIncome: row.netIncome.toNumber(),
    balance: row.balance.toNumber()
  }));
}
