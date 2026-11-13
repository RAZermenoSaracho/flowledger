import type { ReactNode } from "react";
import type { ListSelection } from "../../types/common.types";
import { Button } from "../Button";

/**
 * Selection bar of a `ListView`: "N selected", "Select page" (the visible window), "Clear",
 * "Select all N matching" (offered once the whole window is selected and the list supports it),
 * then the module's `bulkActions`.
 */
export function ListViewSelectionBar({
  selection,
  windowIds,
  bulkActions
}: {
  selection: ListSelection;
  windowIds: string[];
  bulkActions?: ReactNode;
}) {
  const windowSelected = windowIds.length > 0 && windowIds.every((id) => selection.isSelected(id));
  const offerAllMatching =
    selection.canSelectAllMatching &&
    !selection.allMatching &&
    windowSelected &&
    selection.total != null &&
    selection.total > windowIds.length;

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-800"
    >
      <span className="font-medium" aria-live="polite">
        {selection.count} selected
      </span>
      <Button type="button" variant="secondary" className="min-h-11" onClick={() => selection.setWindow(windowIds, true)}>
        Select page
      </Button>
      {offerAllMatching ? (
        <Button type="button" variant="secondary" className="min-h-11" onClick={selection.selectAllMatching}>
          Select all {selection.total} matching
        </Button>
      ) : null}
      <Button type="button" variant="secondary" className="min-h-11" disabled={selection.count === 0} onClick={selection.clear}>
        Clear
      </Button>
      {bulkActions}
    </div>
  );
}
