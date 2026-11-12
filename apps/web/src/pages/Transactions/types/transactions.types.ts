import type { Category } from "../../../types/categories.types";
import type { ParticipantStatus } from "@flowledger/shared";
import type { ShareAcceptance } from "../../../types/sharedExpenses.types";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";

/** Which of the Transactions page's two tabs is active. */
export type TransactionsTab = "transactions" | "imported";

/**
 * One participant row of a transaction draft's split. `draftId` is the stable client key (an
 * existing participant's server id, or a generated id for a new row); `shareAmount` is the raw input string.
 * `id`, `paidAmount`, `status` and `acceptance` are the server-owned values of a stored row; they are
 * display and lock inputs only and are never sent (the server owns payment and consent state).
 */
export type ParticipantDraft = {
  draftId: string;
  id?: string;
  paidAmount?: number;
  status?: ParticipantStatus;
  acceptance?: ShareAcceptance;
  userId?: string | null;
  participantName: string;
  source: "app" | "manual";
  shareAmount: string;
};

/**
 * Draft state of the Transaction Form View, for new and existing transactions alike. Money and
 * date fields are raw input strings (`date` is a `datetime-local` value); empty strings mean "none".
 * `isShared`, `sharedTitle` and `participants` are the sharing state, saved with the same request as the other fields.
 */
export type TransactionDraft = {
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
  participants: ParticipantDraft[];
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
