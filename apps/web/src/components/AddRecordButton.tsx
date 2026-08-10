import { Plus } from "lucide-react";
import { Button } from "./Button";

/**
 * Add-record trigger, meant to sit inline beside a `<SearchBar>` on both
 * mobile and desktop. Desktop renders the full labeled button unchanged;
 * mobile collapses it to a compact `+` icon so it doesn't compete for
 * space with the search bar on a narrow screen.
 */
export function AddRecordButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        className="hidden h-10 shrink-0 items-center justify-center whitespace-nowrap lg:inline-flex"
        onClick={onClick}
      >
        Add {label}
      </Button>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-pine text-white transition hover:bg-pine/90 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:bg-emerald-700 dark:hover:bg-emerald-600 dark:focus:ring-offset-slate-950 lg:hidden"
        aria-label={`Add ${label}`}
        onClick={onClick}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}
