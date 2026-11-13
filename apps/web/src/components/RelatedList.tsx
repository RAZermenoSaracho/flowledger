import type { RelatedListProps } from "../types/common.types";
import { Button } from "./Button";

/**
 * A titled list of rows with caller-rendered cells: a `<table>` from `sm` up, stacked
 * label/value rows below (same DOM, switched by CSS, so an `EditableField` in a cell exists once).
 * Holds no domain logic; whether rows live in a draft or are saved immediately is the caller's
 * choice. Loading, error and empty states replace the rows, and `footer` only follows real rows.
 */
export function RelatedList<Row>({
  title,
  rows,
  rowKey,
  columns,
  isLoading = false,
  error,
  emptyText,
  onAdd,
  addLabel = "Add",
  onRemove,
  canRemove = () => true,
  footer,
  headerActions
}: RelatedListProps<Row>) {
  const showRows = !isLoading && !error && rows.length > 0;

  return (
    <section aria-label={title} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {onAdd || headerActions ? (
          <div className="flex min-w-0 items-center gap-2">
            {headerActions}
            {onAdd ? (
              <Button type="button" variant="secondary" onClick={onAdd}>
                {addLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          Loading...
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
      ) : (
        <table className="block w-full text-sm sm:table">
          <thead className="sr-only sm:table-header-group sm:not-sr-only">
            <tr className="sm:table-row">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-2 py-2 font-medium text-slate-500 dark:text-slate-400 ${column.align === "right" ? "text-right" : "text-left"}`}
                >
                  {column.header}
                </th>
              ))}
              {onRemove ? (
                <th scope="col" className="px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="block border-t border-slate-200 py-2 sm:table-row sm:py-0 dark:border-slate-700"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`block px-2 py-1 sm:table-cell sm:py-2 ${column.align === "right" ? "sm:text-right" : ""}`}
                  >
                    <span aria-hidden="true" className="block text-xs font-medium text-slate-500 sm:hidden dark:text-slate-400">
                      {column.header}
                    </span>
                    {column.cell(row)}
                  </td>
                ))}
                {onRemove ? (
                  <td className="block px-2 py-1 sm:table-cell sm:py-2 sm:text-right">
                    {canRemove(row) ? (
                      <Button type="button" variant="secondary" onClick={() => onRemove(row)}>
                        Remove
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showRows && footer ? <div>{footer}</div> : null}
    </section>
  );
}
