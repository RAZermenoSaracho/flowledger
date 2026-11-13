import { Button } from "../../../components/Button";
import { SelectField } from "../../../components/FormField";
import * as transactionsClient from "../../../services/transactions.client";
import type { ImportedTransactionSelectionToolbarProps } from "../types/transactions.types";

/**
 * Bulk-action content for the Imported Transactions `ListView` selection bar: batch category,
 * Import/Ignore/Unignore (gated by the visible rows' status) and the last batch error with its
 * per-row failures.
 */
export function ImportedTransactionSelectionToolbar({
  categories,
  batchCategoryId,
  hasSelection,
  allMatching,
  isPendingFilter,
  isIgnoredFilter,
  isImporting,
  isIgnoring,
  isUnignoring,
  batchError,
  onBatchCategoryChange,
  onImportSelected,
  onIgnoreSelected,
  onUnignoreSelected
}: ImportedTransactionSelectionToolbarProps) {
  const actionScope = allMatching
    ? "all filtered results"
    : "visible selection";
  const batchErrorMessage =
    batchError instanceof Error ? batchError.message : undefined;

  return (
    <>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto] sm:items-end">
        <SelectField
          label="Batch category"
          value={batchCategoryId}
          onChange={(event) => onBatchCategoryChange(event.target.value)}
          disabled={!isPendingFilter}
        >
          <option value="">Use row categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        {isPendingFilter ? (
          <Button
            type="button"
            disabled={isImporting || !hasSelection}
            onClick={onImportSelected}
          >
            Import {actionScope}
          </Button>
        ) : null}
        {isPendingFilter ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isIgnoring || !hasSelection}
            onClick={onIgnoreSelected}
          >
            Ignore {actionScope}
          </Button>
        ) : null}
        {isIgnoredFilter ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isUnignoring || !hasSelection}
            onClick={onUnignoreSelected}
          >
            Unignore {actionScope}
          </Button>
        ) : null}
      </div>
      {batchError ? (
        <div className="basis-full rounded-md border border-coral/40 bg-orange-50 p-3 text-sm text-coral dark:bg-orange-950/30 dark:text-orange-300">
          <p className="font-semibold">{batchErrorMessage}</p>
          {transactionsClient.getBatchErrors(batchError).map((error) => (
            <p key={`${error.id}:${error.message}`} className="mt-1">
              {error.id}: {error.message}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
