import type { CategoryType, TransactionType } from "@flowledger/shared";

/** Income/expense/balance summary totals, both gross and net. */
export type Summary = {
  totalIncome: number;
  totalGrossIncome: number;
  totalNetIncome: number;
  totalExpenses: number;
  totalGrossExpenses: number;
  totalExpenseReimbursements: number;
  totalNetExpenses: number;
  currentBalance: number;
  reportIncome: number;
  reportExpenses: number;
  reportBalance: number;
};

/** Per-category report row shape. */
export type CategoryReportRow = {
  categoryId: string | null;
  categoryName: string;
  categoryType: CategoryType | null;
  categoryColor?: string | null;
  type: TransactionType;
  total: number;
  grossIncomeTotal: number;
  incomeOffsetTotal: number;
  netIncomeTotal: number;
  grossExpenseTotal: number;
  reimbursementTotal: number;
  netExpenseTotal: number;
};

/** `CategoryReportRow` extended with chart display fields (label, total, fill color). */
export type CategoryChartRow = CategoryReportRow & {
  displayName: string;
  displayTotal: number;
  chartTotal: number;
  fill: string;
};

/** One month's cashflow row shape. */
export type CashflowRow = {
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
  reportIncome: number;
  reportExpenses: number;
};
