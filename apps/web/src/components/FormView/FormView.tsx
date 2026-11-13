import { CloudUpload, Loader2, X } from "lucide-react";
import {
  Children,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { FormDraftControls, FormViewTab } from "../../types/common.types";
import { ActionMenu } from "../ActionMenu";
import { Button } from "../Button";
import { ModalDialog } from "../ModalDialog";
import { Tabs } from "../Tabs";
import { FormViewHeader } from "./FormViewHeader";

const ACTION_BUTTON_SIZE = "h-9 w-9 shrink-0";

/**
 * Composition shell for an editable record: a header whose first row holds an optional icon-only `backLink` (top-left) and the action group (top-right), with the
 * `title`, compact icon Save/Cancel buttons that render only while the draft is dirty (Save is
 * also always rendered, disabled until dirty and valid, when `isNew`), an optional "Record
 * actions" menu built from `actions` (`ActionMenuItem`s), the inline `draft.saveError`, optional
 * URL-driven tabs (`?tab=`) and plain `children` sections that never touch the draft.
 * Ctrl/Cmd+S saves when Save is enabled; `onSave` replaces `draft.save`. Cancel discards the draft
 * immediately; clicking the back link while dirty asks for confirmation before navigating. The
 * caller owns the draft hook, so the draft survives tab switches. There is no Edit mode.
 * `draft` is optional: without it the view is read-only chrome (title, back link, tabs, actions) with no
 * Save/Cancel, Ctrl/Cmd+S does nothing, and the back link navigates without the dirty guard.
 */
export function FormView({
  title,
  subtitle,
  headerExtra,
  tabs,
  children,
  draft,
  onSave,
  backLink,
  isNew,
  actions
}: {
  title: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  tabs?: FormViewTab[];
  children?: ReactNode;
  draft?: FormDraftControls;
  onSave?: () => void | Promise<void>;
  backLink?: { to: string; label: string };
  isNew?: boolean;
  actions?: ReactNode;
}) {
  const reasonId = useId();
  const dialogTitleId = useId();
  const navigate = useNavigate();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const hasErrors = Object.keys(draft?.fieldErrors ?? {}).length > 0;
  const saveReason = draft?.isSaving
    ? "Saving..."
    : !draft?.isDirty
      ? "No changes to save"
      : hasErrors
        ? "Fix the highlighted fields to save"
        : null;
  const doSave = onSave ?? draft?.save;
  const showSave = Boolean(draft) && (draft?.isDirty || Boolean(isNew));
  const iconButton = `${ACTION_BUTTON_SIZE} inline-flex items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-slate-950`;

  const latest = useRef({ canSave: saveReason === null, doSave });
  latest.current = { canSave: saveReason === null, doSave };
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s")
        return;
      if (!latest.current.canSave) return;
      event.preventDefault();
      void latest.current.doSave?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function confirmLeave() {
    const to = leaveTo;
    setLeaveTo(null);
    draft?.cancel();
    if (to) navigate(to);
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <FormViewHeader
        title={title}
        subtitle={subtitle}
        backLink={backLink}
        onBackClick={(event) => {
          if (!draft?.isDirty || !backLink) return;
          event.preventDefault();
          setLeaveTo(backLink.to);
        }}
        actions={
          <>
            {showSave ? (
              <button
                type="button"
                aria-label="Save"
                title={saveReason ?? "Save"}
                aria-busy={draft?.isSaving}
                disabled={saveReason !== null}
                aria-describedby={saveReason ? `${reasonId}-save` : undefined}
                onClick={() => void doSave?.()}
                className={`${iconButton} border-pine bg-pine text-white hover:bg-emerald-800`}
              >
                {draft?.isSaving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CloudUpload className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            ) : null}
            {draft?.isDirty ? (
              <button
                type="button"
                aria-label="Cancel"
                title="Cancel"
                disabled={draft?.isSaving}
                onClick={() => draft?.cancel()}
                className={`${iconButton} border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {showSave && saveReason ? (
              <span id={`${reasonId}-save`} className="sr-only">
                {saveReason}
              </span>
            ) : null}
            {Children.toArray(actions).length > 0 ? (
              <ActionMenu label="Record actions">{actions}</ActionMenu>
            ) : null}
          </>
        }
      />
      {draft?.saveError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {draft.saveError}
        </p>
      ) : null}
      {headerExtra}
      {tabs && tabs.length > 0 ? <UrlTabs tabs={tabs} /> : null}
      {children}
      {leaveTo ? (
        <ModalDialog
          titleId={dialogTitleId}
          title="Discard unsaved changes?"
          onCancel={() => setLeaveTo(null)}
        >
          <p className="mt-2 text-sm">Your edits will be lost.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLeaveTo(null)}
            >
              Keep editing
            </Button>
            <Button type="button" variant="danger" onClick={confirmLeave}>
              Discard changes
            </Button>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}

function UrlTabs({ tabs }: { tabs: FormViewTab[] }) {
  const [params, setParams] = useSearchParams();
  const activeId = (tabs.find((t) => t.id === params.get("tab")) ?? tabs[0]!)
    .id;

  return (
    <Tabs
      tabs={tabs}
      activeId={activeId}
      onSelect={(id) =>
        setParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.set("tab", id);
            return next;
          },
          { replace: true }
        )
      }
    />
  );
}
