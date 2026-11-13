import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createEmptyGroup,
  pruneIncompleteConditions,
  type DomainGroupNode,
  type SearchFieldConfig
} from "../../utils/searchDomain";
import { Button } from "../Button";
import { DomainGroupEditor } from "./ConditionEditor";

/**
 * Odoo-style domain builder popup: an unbounded AND/OR condition tree
 * over whatever `fields` the caller passes. Every field/operator/value
 * widget is driven entirely by {@link SearchFieldConfig} — nothing here
 * is specific to any one module's data model.
 *
 * Edits happen against a local draft, seeded from `initialDomain` each
 * time the popup opens; `onApply` only fires when the user clicks
 * "Done", with incomplete conditions (empty value, one
 * empty `between` bound) dropped first so they never become chips. Closing any other way (the X button, clicking the backdrop)
 * discards the draft, so the caller's committed domain — and whatever
 * query it drives — never changes mid-edit.
 */
export function FilterBuilder({
  isOpen,
  onClose,
  fields,
  initialDomain,
  onApply
}: {
  isOpen: boolean;
  onClose: () => void;
  fields: SearchFieldConfig[];
  initialDomain: DomainGroupNode;
  onApply: (domain: DomainGroupNode) => void;
}) {
  const [draftDomain, setDraftDomain] = useState(initialDomain);

  useEffect(() => {
    if (isOpen) setDraftDomain(initialDomain);
    // Only reseed when the popup transitions to open — `initialDomain`
    // identity is expected to change independently (e.g. a pill removed
    // in the searchbar while this popup is closed) without this effect
    // clobbering an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.label.localeCompare(b.label)),
    [fields]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="grid max-h-[85vh] w-full max-w-2xl gap-4 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <DomainGroupEditor
          root={draftDomain}
          node={draftDomain}
          fields={sortedFields}
          onRootChange={setDraftDomain}
          isRoot
        />

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDraftDomain(createEmptyGroup("and"))}
          >
            Clear conditions
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => onApply(pruneIncompleteConditions(draftDomain))}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
