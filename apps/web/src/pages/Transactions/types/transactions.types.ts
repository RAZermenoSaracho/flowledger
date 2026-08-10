import type { Category } from "../../../types/categories.types";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";

/** Which of the Transactions page's two tabs is active. */
export type TransactionsTab = "transactions" | "imported";

/** Draft state for the create-transaction form, before it's parsed/validated into a request body. */
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

/** Draft state for one shared-expense participant being added to a transaction's split, before save. */
export type ParticipantDraft = {
  draftId: string;
  userId?: string | null;
  participantName: string;
  email?: string;
  source: "app" | "manual";
  shareAmount: string;
};

/** Draft state for the edit-transaction form, before it's parsed/validated into a request body. */
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

/** Props for one row in the Imported Transactions review list. */
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

/** Props for the bulk-selection/batch-action toolbar above the Imported Transactions review list. */
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
