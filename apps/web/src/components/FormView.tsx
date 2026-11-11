import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormDraftControls, FormViewTab } from "../types/common.types";
import { Button } from "./Button";
import { ModalDialog } from "./ModalDialog";

/**
 * Composition shell for an editable record: a header row with `title`, always-visible compact
 * Save and Discard buttons (disabled with a stated reason while clean, saving or invalid), the
 * inline `draft.saveError`, optional URL-driven tabs (`?tab=`) and plain `children` sections that
 * never touch the draft. Ctrl/Cmd+S saves when Save is enabled. `onSave` replaces `draft.save`.
 * Discard and `onBack` ask for confirmation while dirty. The caller owns the draft hook, so
 * the draft survives tab switches. There is no Edit button or edit mode.
 */
export function FormView({
  title,
  subtitle,
  headerExtra,
  tabs,
  children,
  draft,
  onSave,
  onBack
}: {
  title: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  tabs?: FormViewTab[];
  children?: ReactNode;
  draft: FormDraftControls;
  onSave?: () => void | Promise<void>;
  onBack?: () => void;
}) {
  const reasonId = useId();
  const dialogTitleId = useId();
  const [pending, setPending] = useState<"discard" | "back" | null>(null);
  const hasErrors = Object.keys(draft.fieldErrors).length > 0;
  const saveReason = draft.isSaving
    ? "Saving..."
    : !draft.isDirty
      ? "No changes to save"
      : hasErrors
        ? "Fix the highlighted fields to save"
        : null;
  const discardReason = draft.isDirty ? null : "No changes to discard";
  const doSave = onSave ?? draft.save;

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

  function request(action: "discard" | "back") {
    if (draft.isDirty) setPending(action);
    else if (action === "back") onBack?.();
  }

  function confirm() {
    const action = pending;
    setPending(null);
    draft.cancel();
    if (action === "back") onBack?.();
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {onBack ? (
            <Button type="button" variant="secondary" onClick={() => request("back")} className="mb-2">
              Back
            </Button>
          ) : null}
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            aria-busy={draft.isSaving}
            disabled={saveReason !== null}
            title={saveReason ?? undefined}
            aria-describedby={saveReason ? `${reasonId}-save` : undefined}
            onClick={() => void doSave()}
          >
            {draft.isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={discardReason !== null}
            title={discardReason ?? undefined}
            aria-describedby={discardReason ? `${reasonId}-discard` : undefined}
            onClick={() => request("discard")}
          >
            Discard
          </Button>
          {saveReason ? <span id={`${reasonId}-save`} className="sr-only">{saveReason}</span> : null}
          {discardReason ? <span id={`${reasonId}-discard`} className="sr-only">{discardReason}</span> : null}
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
      {pending ? (
        <ModalDialog titleId={dialogTitleId} title="Discard unsaved changes?" onCancel={() => setPending(null)}>
          <p className="mt-2 text-sm">Your edits will be lost.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button type="button" variant="danger" onClick={confirm}>
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
