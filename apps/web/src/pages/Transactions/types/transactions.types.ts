import type { Account } from "../../../types/accounts.types";
import type { useImportedTransactionsWorkflow } from "../hooks/useImportedTransactionsWorkflow";
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
  paidAmount?: string;
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
 * `accountAmount` / `destinationAmount` hold the applied amounts only while their currency coupling shows them, and `feeAmount` / `feeCurrency` the optional fee; all are empty strings otherwise.
 * `isShared`, `sharedTitle` and `participants` are the sharing state, saved with the same request as the other fields.
 */
export type TransactionDraft = {
  name: string;
  amount: string;
  accountAmount: string;
  destinationAmount: string;
  feeAmount: string;
  feeCurrency: string;
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
  isImporting: boolean;
  isIgnoring: boolean;
  isUnignoring: boolean;
  onCategoryChange: (categoryId: string | null) => void;
  onImport: () => void;
  onIgnore: () => void;
  onUnignore: () => void;
};

/** Props for the bulk-action content shown in the Imported Transactions selection bar. */
export type ImportedTransactionSelectionToolbarProps = {
  categories: Category[];
  batchCategoryId: string;
  /** Whether anything (ids or all matching rows) is selected; gates the batch buttons. */
  hasSelection: boolean;
  /** Whether batch actions apply to every matching row rather than the selected ids. */
  allMatching: boolean;
  isPendingFilter: boolean;
  isIgnoredFilter: boolean;
  isImporting: boolean;
  isIgnoring: boolean;
  isUnignoring: boolean;
  /** The last failed batch mutation's error, shown with its per-row failures. */
  batchError: unknown;
  onBatchCategoryChange: (categoryId: string) => void;
  onImportSelected: () => void;
  onIgnoreSelected: () => void;
  onUnignoreSelected: () => void;
};

/** Props for the Imported Transactions tab: the workflow state plus the lookup data and URL-seeded filter it renders with. */
export type ImportedTransactionsTabProps = {
  imported: ReturnType<typeof useImportedTransactionsWorkflow>;
  categories: Category[];
  accounts: Account[];
  /** Status seeded into the filter by the URL's `status` param, or null. */
  initialStatus: string | null;
  /** Changing this remounts the filter `SearchBar` so it re-reads `initialStatus`. */
  searchBarResetKey: number;
  /** Switches the list to the pending status filter (the "Show pending" banner button). */
  onShowPending: () => void;
};
