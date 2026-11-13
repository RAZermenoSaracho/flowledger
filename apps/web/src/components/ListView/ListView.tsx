import type { ReactNode } from "react";
import type { ListViewProps } from "../../types/common.types";
import { Card } from "../Card";
import { EmptyState } from "../EmptyState";
import { ListViewPagination } from "./ListViewPagination";
import { ListViewSelectionBar } from "./ListViewSelectionBar";

function countText(shown: number, total: number | undefined) {
  if (total != null && total > shown) return `${shown} of ${total}`;
  return shown === 1 ? "1 record" : `${shown} records`;
}

/**
 * Model-agnostic list shell inside one card: header (title, subtitle, record count, actions, pager),
 * a `toolbar` slot, an optional selection bar, and the body (`items` or labelled `groups`, rendered
 * by `renderItem` as a `stack` or two-column `grid`). It fetches nothing and knows no model.
 *
 * The pager carries the count; without one the header reads "shown of total" or "N records".
 * Loading shows only while there are no rows (a refetch keeps them), `error` renders as an alert
 * without hiding the header or toolbar, and `emptyText` shows through `EmptyState`. On narrow screens
 * the pager takes its own full-width row under the title and actions.
 */
export function ListView<T>({
  title,
  subtitle,
  actions,
  toolbar,
  items,
  groups,
  rowKey,
  renderItem,
  itemLabel,
  layout = "stack",
  isLoading = false,
  error,
  emptyText,
  total,
  pager,
  selection,
  bulkActions
}: ListViewProps<T>) {
  const visibleGroups = (groups ?? []).filter((group) => group.items.length > 0);
  const rows = groups ? visibleGroups.flatMap((group) => group.items) : (items ?? []);
  const windowIds = rows.map(rowKey);
  const loaded = !isLoading && !error;
  const containerClass = layout === "grid" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3";

  const renderRows = (list: T[]): ReactNode => (
    <div className={containerClass}>
      {list.map((item) => {
        const id = rowKey(item);
        return selection ? (
          <div key={id} className="flex min-w-0 items-start gap-3">
            <input
              type="checkbox"
              aria-label={itemLabel ? itemLabel(item) : `Select record ${windowIds.indexOf(id) + 1}`}
              checked={selection.isSelected(id)}
              onChange={() => selection.toggle(id, windowIds)}
              className="mt-4 h-5 w-5 shrink-0"
            />
            <div className="min-w-0 flex-1">{renderItem(item)}</div>
          </div>
        ) : (
          <div key={id} className="min-w-0">
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );

  let body: ReactNode;
  if (error) {
    body = (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  } else if (isLoading && rows.length === 0) {
    body = (
      <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
        Loading...
      </p>
    );
  } else if (rows.length === 0) {
    body = <EmptyState>{emptyText}</EmptyState>;
  } else if (groups) {
    body = (
      <div className="grid gap-4">
        {visibleGroups.map((group) => (
          <section key={group.key} className="grid gap-2">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{group.label}</h3>
            {renderRows(group.items)}
          </section>
        ))}
      </div>
    );
  } else {
    body = renderRows(rows);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          {!pager && loaded ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{countText(rows.length, total)}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
        {pager ? (
          <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
            <ListViewPagination {...pager} />
          </div>
        ) : null}
      </div>
      {toolbar ? <div className="mt-3 w-full min-w-0">{toolbar}</div> : null}
      {selection ? (
        <ListViewSelectionBar selection={selection} windowIds={windowIds} bulkActions={bulkActions} />
      ) : null}
      <div className="mt-3 min-w-0">{body}</div>
    </Card>
  );
}
