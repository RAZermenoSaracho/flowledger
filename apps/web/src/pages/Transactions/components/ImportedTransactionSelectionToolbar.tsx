import { Button } from "../../../components/Button";
import { SelectField } from "../../../components/FormField";
import type { Category } from "../../../types/api";

type ImportedTransactionSelectionToolbarProps = {
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

export function ImportedTransactionSelectionToolbar({
  totalFilteredCount,
  visibleCount,
  selectedCount,
  selectedVisibleCount,
  allFilteredSelected,
  batchCategoryId,
  categories,
  isPendingFilter,
  isIgnoredFilter,
  isImporting,
  isIgnoring,
  isUnignoring,
  onBatchCategoryChange,
  onVisibleSelectionChange,
  onAllFilteredSelectionChange,
  onImportSelected,
  onIgnoreSelected,
  onUnignoreSelected
}: ImportedTransactionSelectionToolbarProps) {
  const hasSelection = allFilteredSelected || selectedCount > 0;
  const allVisibleSelected =
    allFilteredSelected ||
    (visibleCount > 0 && selectedVisibleCount === visibleCount);
  const selectionMessage = allFilteredSelected
    ? `All ${totalFilteredCount} filtered imported transaction${
        totalFilteredCount === 1 ? " is" : "s are"
      } selected.`
    : `${selectedCount} imported transaction${
        selectedCount === 1 ? "" : "s"
      } selected.`;
  const actionScope = allFilteredSelected
    ? "all filtered results"
    : "visible selection";

  return (
    <div className="mt-4 grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div className="grid gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-pine"
                checked={allVisibleSelected}
                disabled={visibleCount === 0}
                onChange={(event) =>
                  onVisibleSelectionChange(event.target.checked)
                }
              />
              Select visible rows
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-pine"
                checked={allFilteredSelected}
                disabled={totalFilteredCount === 0}
                onChange={(event) =>
                  onAllFilteredSelectionChange(event.target.checked)
                }
              />
              Select all filtered results
            </label>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            {selectionMessage}
          </p>
          {hasSelection ? (
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Batch actions affect {actionScope}.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto] sm:items-end">
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
      </div>
    </div>
  );
}
