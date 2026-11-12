import { Button } from "./Button";
import { SelectField } from "./FormField";

/**
 * Previous / "Page X of Y" / Next footer for a server-paginated list, with an optional page-size
 * select (shown only when both `pageSizeOptions` and `onPageSizeChange` are given). Both buttons
 * are disabled while `isFetching`; `pageCount`/`total` may be unknown (null/undefined).
 */
export function Pagination({
  page,
  pageCount,
  total,
  hasNext,
  isFetching = false,
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange
}: {
  page: number;
  pageCount?: number | null;
  total?: number | null;
  hasNext: boolean;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 pt-3"
    >
      <Button
        type="button"
        variant="secondary"
        disabled={page <= 1 || isFetching}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-center text-sm text-slate-500 dark:text-slate-400">
        {pageCount ? `Page ${page} of ${pageCount}` : `Page ${page}`}
        {total != null ? ` · ${total} results` : ""}
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={!hasNext || isFetching}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
      {pageSizeOptions && onPageSizeChange ? (
        <div className="basis-full sm:basis-auto">
          <SelectField
            label="Rows per page"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}
    </nav>
  );
}
