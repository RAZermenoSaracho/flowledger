import { useMemo } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { ListView } from "../../../components/ListView";
import type { ProviderImportedTransaction } from "../../../types/transactions.types";
import type { ImportedTransactionsTabProps } from "../types/transactions.types";
import {
  ImportedTransactionCard,
  providerAccountLabel
} from "./ImportedTransactionCard";
import { ImportedTransactionSelectionToolbar } from "./ImportedTransactionSelectionToolbar";
import { ImportedTransactionsFiltersCard } from "./ImportedTransactionsFiltersCard";

function rowKey(transaction: ProviderImportedTransaction) {
  return transaction.id;
}

/**
 * Imported Transactions tab body: the pending-review banner and a `ListView` of provider rows with
 * a filter toolbar, range pager, cross-window selection and batch import/ignore/unignore actions.
 */
export function ImportedTransactionsTab({
  imported,
  categories,
  accounts,
  initialStatus,
  searchBarResetKey,
  onShowPending
}: ImportedTransactionsTabProps) {
  const { selection } = imported;
  const providerAccountOptions = useMemo(() => {
    const seen = new Set<string>();
    return imported.importedTransactions.flatMap((transaction) => {
      const id =
        transaction.providerAccount?.id ?? transaction.providerAccountId;
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const linked = transaction.providerAccount?.account?.name;
      return [
        {
          id,
          label: [
            providerAccountLabel(transaction) || transaction.providerAccountId,
            linked ? `Linked to ${linked}` : null
          ]
            .filter(Boolean)
            .join(" · ")
        }
      ];
    });
  }, [imported.importedTransactions]);

  return (
    <div className="grid gap-4">
      {imported.pendingCount > 0 ? (
        <Card>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              You have {imported.pendingCount} imported transaction
              {imported.pendingCount === 1 ? "" : "s"} pending review.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onShowPending}
            >
              Show pending
            </Button>
          </div>
        </Card>
      ) : null}

      <ListView<ProviderImportedTransaction>
        title="Imported transactions"
        toolbar={
          <ImportedTransactionsFiltersCard
            resetKey={searchBarResetKey}
            initialStatus={initialStatus}
            onQueryChange={imported.updateImportedQuery}
            accounts={accounts}
            categories={categories}
            providerAccountOptions={providerAccountOptions}
          />
        }
        items={imported.importedTransactions}
        rowKey={rowKey}
        itemLabel={(transaction) => `Select imported transaction ${transaction.description}`}
        isLoading={imported.isLoading}
        error={imported.error}
        emptyText="No imported transactions found."
        pager={imported.pager}
        selection={selection}
        bulkActions={
          <ImportedTransactionSelectionToolbar
            categories={categories}
            batchCategoryId={imported.batchCategoryId}
            hasSelection={selection.count > 0}
            allMatching={selection.allMatching}
            isPendingFilter={imported.isPendingFilter}
            isIgnoredFilter={imported.isIgnoredFilter}
            isImporting={imported.batchImportImportedTransactions.isPending}
            isIgnoring={imported.batchIgnoreImportedTransactions.isPending}
            isUnignoring={imported.batchUnignoreImportedTransactions.isPending}
            batchError={
              imported.batchImportImportedTransactions.error ??
              imported.batchIgnoreImportedTransactions.error ??
              imported.batchUnignoreImportedTransactions.error
            }
            onBatchCategoryChange={imported.setBatchCategoryId}
            onImportSelected={() =>
              imported.batchImportImportedTransactions.mutate()
            }
            onIgnoreSelected={() =>
              imported.batchIgnoreImportedTransactions.mutate()
            }
            onUnignoreSelected={() =>
              imported.batchUnignoreImportedTransactions.mutate()
            }
          />
        }
        renderItem={(transaction) => (
          <ImportedTransactionCard
            transaction={transaction}
            categories={categories}
            isImporting={imported.importImportedTransaction.isPending}
            isIgnoring={imported.ignoreImportedTransaction.isPending}
            isUnignoring={imported.unignoreImportedTransaction.isPending}
            onCategoryChange={(categoryId) =>
              imported.updateImportedCategory.mutate({
                id: transaction.id,
                categoryId
              })
            }
            onImport={() =>
              void imported.importOneImportedTransaction(transaction)
            }
            onIgnore={() =>
              imported.ignoreImportedTransaction.mutate(transaction.id)
            }
            onUnignore={() =>
              imported.unignoreImportedTransaction.mutate(transaction.id)
            }
          />
        )}
      />
    </div>
  );
}
