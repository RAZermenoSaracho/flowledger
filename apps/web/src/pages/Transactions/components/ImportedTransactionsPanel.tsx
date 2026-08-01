import { Card } from "../../../components/Card";
import * as transactionsClient from "../../../services/transactions.client";
import type { Category } from "../../../types/categories.types";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";
import { ImportedTransactionCard } from "./ImportedTransactionCard";
import { ImportedTransactionSelectionToolbar } from "./ImportedTransactionSelectionToolbar";

export function ImportedTransactionsPanel({
  totalCount,
  importedTransactions,
  categories,
  selectedImportedIds,
  selectAllFilteredImported,
  batchCategoryId,
  isPendingFilter,
  isIgnoredFilter,
  isBatchImporting,
  isBatchIgnoring,
  isBatchUnignoring,
  isImporting,
  isIgnoring,
  isUnignoring,
  isLoading,
  batchError,
  onBatchCategoryChange,
  onVisibleSelectionChange,
  onAllFilteredSelectionChange,
  onImportSelected,
  onIgnoreSelected,
  onUnignoreSelected,
  onToggleSelection,
  onCategoryChange,
  onImport,
  onIgnore,
  onUnignore
}: {
  totalCount: number;
  importedTransactions: ProviderImportedTransaction[];
  categories: Category[];
  selectedImportedIds: string[];
  selectAllFilteredImported: boolean;
  batchCategoryId: string;
  isPendingFilter: boolean;
  isIgnoredFilter: boolean;
  isBatchImporting: boolean;
  isBatchIgnoring: boolean;
  isBatchUnignoring: boolean;
  isImporting: boolean;
  isIgnoring: boolean;
  isUnignoring: boolean;
  isLoading: boolean;
  batchError: unknown;
  onBatchCategoryChange: (categoryId: string) => void;
  onVisibleSelectionChange: (selected: boolean) => void;
  onAllFilteredSelectionChange: (selected: boolean) => void;
  onImportSelected: () => void;
  onIgnoreSelected: () => void;
  onUnignoreSelected: () => void;
  onToggleSelection: (id: string) => void;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onImport: (transaction: ProviderImportedTransaction) => void;
  onIgnore: (id: string) => void;
  onUnignore: (id: string) => void;
}) {
  const selectedVisibleCount = importedTransactions.filter((transaction) =>
    selectedImportedIds.includes(transaction.id)
  ).length;
  const batchErrorMessage =
    batchError instanceof Error ? batchError.message : undefined;

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Imported Transactions</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {totalCount} matching row{totalCount === 1 ? "" : "s"}.
          </p>
        </div>
      </div>

      <ImportedTransactionSelectionToolbar
        totalFilteredCount={totalCount}
        visibleCount={importedTransactions.length}
        selectedCount={selectedImportedIds.length}
        selectedVisibleCount={selectedVisibleCount}
        allFilteredSelected={selectAllFilteredImported}
        batchCategoryId={batchCategoryId}
        categories={categories}
        isPendingFilter={isPendingFilter}
        isIgnoredFilter={isIgnoredFilter}
        isImporting={isBatchImporting}
        isIgnoring={isBatchIgnoring}
        isUnignoring={isBatchUnignoring}
        onBatchCategoryChange={onBatchCategoryChange}
        onVisibleSelectionChange={onVisibleSelectionChange}
        onAllFilteredSelectionChange={onAllFilteredSelectionChange}
        onImportSelected={onImportSelected}
        onIgnoreSelected={onIgnoreSelected}
        onUnignoreSelected={onUnignoreSelected}
      />

      {batchError ? (
        <div className="mt-3 rounded-md border border-coral/40 bg-orange-50 p-3 text-sm text-coral dark:bg-orange-950/30 dark:text-orange-300">
          <p className="font-semibold">{batchErrorMessage}</p>
          {transactionsClient.getBatchErrors(batchError).map((error) => (
            <p key={`${error.id}:${error.message}`} className="mt-1">
              {error.id}: {error.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {importedTransactions.map((transaction) => (
          <ImportedTransactionCard
            key={transaction.id}
            transaction={transaction}
            categories={categories}
            isSelected={
              selectAllFilteredImported ||
              selectedImportedIds.includes(transaction.id)
            }
            isSelectionLocked={selectAllFilteredImported}
            isImporting={isImporting}
            isIgnoring={isIgnoring}
            isUnignoring={isUnignoring}
            onSelectedChange={() => onToggleSelection(transaction.id)}
            onCategoryChange={(categoryId) =>
              onCategoryChange(transaction.id, categoryId)
            }
            onImport={() => onImport(transaction)}
            onIgnore={() => onIgnore(transaction.id)}
            onUnignore={() => onUnignore(transaction.id)}
          />
        ))}

        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading imported transactions.
          </p>
        ) : null}

        {!isLoading && importedTransactions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No imported transactions found.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
