import { CloudUpload, Loader2, X } from "lucide-react";
import { Children, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { FormDraftControls, FormViewTab } from "../types/common.types";
import { ActionMenu } from "./ActionMenu";
import { Button } from "./Button";
import { ModalDialog } from "./ModalDialog";

/**
 * Composition shell for an editable record: a header with an optional descriptive `backLink`, the
 * `title`, compact icon Save/Cancel buttons that render only while the draft is dirty (Save is
 * also always rendered, disabled until dirty and valid, when `isNew`), an optional "Record
 * actions" menu built from `actions` (`ActionMenuItem`s), the inline `draft.saveError`, optional
 * URL-driven tabs (`?tab=`) and plain `children` sections that never touch the draft.
 * Ctrl/Cmd+S saves when Save is enabled; `onSave` replaces `draft.save`. Cancel discards the draft
 * immediately; clicking the back link while dirty asks for confirmation before navigating. The
 * caller owns the draft hook, so the draft survives tab switches. There is no Edit mode.
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
  draft: FormDraftControls;
  onSave?: () => void | Promise<void>;
  backLink?: { to: string; label: string };
  isNew?: boolean;
  actions?: ReactNode;
}) {
  const reasonId = useId();
  const dialogTitleId = useId();
  const navigate = useNavigate();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const hasErrors = Object.keys(draft.fieldErrors).length > 0;
  const saveReason = draft.isSaving
    ? "Saving..."
    : !draft.isDirty
      ? "No changes to save"
      : hasErrors
        ? "Fix the highlighted fields to save"
        : null;
  const doSave = onSave ?? draft.save;
  const showSave = draft.isDirty || Boolean(isNew);
  const iconButton =
    "inline-flex h-10 w-10 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-slate-950";

  const latest = useRef({ canSave: saveReason === null, doSave });
  latest.current = { canSave: saveReason === null, doSave };
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      if (!latest.current.canSave) return;
      event.preventDefault();
      void latest.current.doSave();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function confirmLeave() {
    const to = leaveTo;
    setLeaveTo(null);
    draft.cancel();
    if (to) navigate(to);
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          {backLink ? (
            <Link
              to={backLink.to}
              onClick={(event) => {
                if (!draft.isDirty) return;
                event.preventDefault();
                setLeaveTo(backLink.to);
              }}
              className="mb-2 inline-block rounded text-sm font-semibold text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 dark:text-emerald-300 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-slate-950"
            >
              {backLink.label}
            </Link>
          ) : null}
          <h1 className="break-words text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showSave ? (
            <button
              type="button"
              aria-label="Save"
              title={saveReason ?? "Save"}
              aria-busy={draft.isSaving}
              disabled={saveReason !== null}
              aria-describedby={saveReason ? `${reasonId}-save` : undefined}
              onClick={() => void doSave()}
              className={`${iconButton} border-pine bg-pine text-white hover:bg-emerald-800`}
            >
              {draft.isSaving ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <CloudUpload className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          ) : null}
          {draft.isDirty ? (
            <button
              type="button"
              aria-label="Cancel"
              title="Cancel"
              disabled={draft.isSaving}
              onClick={() => draft.cancel()}
              className={`${iconButton} border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800`}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
          {showSave && saveReason ? <span id={`${reasonId}-save`} className="sr-only">{saveReason}</span> : null}
          {Children.toArray(actions).length > 0 ? <ActionMenu label="Record actions">{actions}</ActionMenu> : null}
        </div>
      </header>
      {draft.saveError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {draft.saveError}
        </p>
      ) : null}
      {headerExtra}
      {tabs && tabs.length > 0 ? <Tabs tabs={tabs} /> : null}
      {children}
      {leaveTo ? (
        <ModalDialog titleId={dialogTitleId} title="Discard unsaved changes?" onCancel={() => setLeaveTo(null)}>
          <p className="mt-2 text-sm">Your edits will be lost.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLeaveTo(null)}>
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

function Tabs({ tabs }: { tabs: FormViewTab[] }) {
  const [params, setParams] = useSearchParams();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = tabs.find((t) => t.id === params.get("tab")) ?? tabs[0]!;

  function select(id: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("tab", id);
        return next;
      },
      { replace: true }
    );
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const id = tabs[next]!.id;
    select(id);
    refs.current[id]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        className="flex overflow-x-auto shadow-[inset_0_-1px_0] shadow-slate-200 dark:shadow-slate-700"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine dark:focus-visible:ring-emerald-400 ${
                selected
                  ? "border-pine text-pine dark:border-emerald-400 dark:text-emerald-300"
                  : "border-transparent text-slate-500 hover:text-ink dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {tab.label}
              {tab.badge ? <span className="ml-2 rounded-full bg-slate-100 px-2 text-xs dark:bg-slate-800">{tab.badge}</span> : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${active.id}`}
        aria-labelledby={`tab-${active.id}`}
        tabIndex={0}
        className="pt-6 focus-visible:outline-none"
      >
        {active.content}
      </div>
    </div>
  );
}
