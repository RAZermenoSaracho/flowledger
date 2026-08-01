import type { Category } from "../../../types/categories.types";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";

export type TransactionsTab = "transactions" | "imported";

export type TransactionFormState = {
  name: string;
  amount: string;
  executionCurrency: string;
  type: "income" | "expense" | "transfer";
  date: string;
  accountId: string;
  transferToAccountId: string;
  categoryId: string;
  groupId: string;
  notes: string;
  isShared: boolean;
  sharedTitle: string;
};

export type ParticipantDraft = {
  draftId: string;
  userId?: string | null;
  participantName: string;
  email?: string;
  source: "app" | "manual";
  shareAmount: string;
};

export type TransactionFilters = {
  search: string;
  transactionFilterType: string;
  dateFrom: string;
  dateTo: string;
  amountFrom: string;
  amountTo: string;
  classification: string;
};

export type TransactionEditForm = {
  name: string;
  amount: string;
  executionCurrency: string;
  type: "income" | "expense" | "transfer";
  date: string;
  accountId: string;
  transferToAccountId: string;
  categoryId: string;
  groupId: string;
  notes: string;
};

export type ImportedFilters = {
  status: string;
  search: string;
  provider: string;
  accountId: string;
  providerAccountId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
  amountFrom: string;
  amountTo: string;
};

export type ImportedSortBy =
  | "transactionDate"
  | "amount"
  | "description"
  | "provider"
  | "status";

export type ImportedTransactionCardProps = {
  transaction: ProviderImportedTransaction;
  categories: Category[];
  isSelected: boolean;
  isSelectionLocked: boolean;
  isImporting: boolean;
  isIgnoring: boolean;
  isUnignoring: boolean;
  onSelectedChange: () => void;
  onCategoryChange: (categoryId: string | null) => void;
  onImport: () => void;
  onIgnore: () => void;
  onUnignore: () => void;
};

export type ImportedTransactionSelectionToolbarProps = {
  totalFilteredCount: number;
  visibleCount: number;
  selectedCount: number;
  selectedVisibleCount: number;
  allFilteredSelected: boolean;
  batchCategoryId: string;
  categories: Category[];
  isPendingFilter: boolean;
  isIgnoredFilter: boolean;
  isImporting: boolean;
  isIgnoring: boolean;
  isUnignoring: boolean;
  onBatchCategoryChange: (categoryId: string) => void;
  onVisibleSelectionChange: (selected: boolean) => void;
  onAllFilteredSelectionChange: (selected: boolean) => void;
  onImportSelected: () => void;
  onIgnoreSelected: () => void;
  onUnignoreSelected: () => void;
};
