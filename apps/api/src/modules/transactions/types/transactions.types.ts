export type ImportedTransactionStatus = "pending" | "processed" | "ignored";

export type ImportedTransactionFilters = {
  status?: ImportedTransactionStatus;
  search?: string;
  provider?: string;
  accountId?: string;
  providerAccountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  sortBy?: "transactionDate" | "amount" | "description" | "provider" | "status";
  sortDirection?: "asc" | "desc";
};

export type ImportedTransactionSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filtered"; filters?: ImportedTransactionFilters };
