import { useRef, type KeyboardEvent } from "react";
import type { TabsProps } from "../types/common.types";

/**
 * Controlled, accessible tab strip with a single tabpanel for the active tab (roving tabIndex,
 * ArrowLeft/Right/Home/End navigation). `idPrefix` namespaces the tab/panel ids; `compact` uses a
 * smaller strip. The strip scrolls horizontally inside itself when it overflows.
 */
export function Tabs({ tabs, activeId, onSelect, idPrefix = "", compact = false }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!;

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
    onSelect(id);
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
              id={`${idPrefix}tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`shrink-0 whitespace-nowrap border-b-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine dark:focus-visible:ring-emerald-400 ${
                compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"
              } ${
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
        id={`${idPrefix}panel-${active.id}`}
        aria-labelledby={`${idPrefix}tab-${active.id}`}
        tabIndex={0}
        className={`focus-visible:outline-none ${compact ? "pt-4" : "pt-6"}`}
      >
        {active.content}
      </div>
    </div>
  );
}
