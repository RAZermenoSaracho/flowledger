import { useRef, type KeyboardEvent } from "react";
import type { TabsProps } from "../types/common.types";
import { Button } from "./Button";

/**
 * Controlled, accessible tab strip with a single tabpanel for the active tab (roving tabIndex,
 * ArrowLeft/Right/Home/End navigation). `idPrefix` namespaces the tab/panel ids; `compact` uses a
 * smaller strip. The default "underline" variant scrolls horizontally inside itself when it overflows;
 * "buttons" renders shared `Button`s that wrap. `desktopOnly` hides the strip below `lg` (the panel
 * still renders), for pages whose mobile navigation lives elsewhere (the sidebar drawer).
 */
export function Tabs({
  tabs,
  label,
  activeId,
  onSelect,
  idPrefix = "",
  compact = false,
  variant = "underline",
  desktopOnly = false
}: TabsProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!;

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const id = tabs[next]!.id;
    onSelect(id);
    stripRef.current
      ?.querySelector<HTMLElement>(`[id="${idPrefix}tab-${id}"]`)
      ?.focus();
  }

  const buttons = variant === "buttons";
  const stripClass = buttons
    ? `${desktopOnly ? "hidden lg:flex" : "flex"} flex-wrap gap-2`
    : `${desktopOnly ? "hidden lg:flex" : "flex"} overflow-x-auto shadow-[inset_0_-1px_0] shadow-slate-200 dark:shadow-slate-700`;

  return (
    <div>
      <div ref={stripRef} role="tablist" aria-label={label} className={stripClass}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active.id;
          const tabProps = {
            type: "button" as const,
            role: "tab",
            id: `${idPrefix}tab-${tab.id}`,
            "aria-selected": selected,
            "aria-controls": `${idPrefix}panel-${tab.id}`,
            tabIndex: selected ? 0 : -1,
            onClick: () => onSelect(tab.id),
            onKeyDown: (event: KeyboardEvent) => onKeyDown(event, index)
          };
          const badge = tab.badge ? (
            <span className="ml-2 rounded-full bg-slate-100 px-2 text-xs dark:bg-slate-800">
              {tab.badge}
            </span>
          ) : null;
          if (buttons) {
            return (
              <Button
                key={tab.id}
                {...tabProps}
                variant={selected ? "primary" : "secondary"}
              >
                {tab.label}
                {badge}
              </Button>
            );
          }
          return (
            <button
              key={tab.id}
              {...tabProps}
              className={`shrink-0 whitespace-nowrap border-b-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine dark:focus-visible:ring-emerald-400 ${
                compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"
              } ${
                selected
                  ? "border-pine text-pine dark:border-emerald-400 dark:text-emerald-300"
                  : "border-transparent text-slate-500 hover:text-ink dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {tab.label}
              {badge}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}panel-${active.id}`}
        aria-labelledby={`${idPrefix}tab-${active.id}`}
        tabIndex={0}
        className={`min-w-0 focus-visible:outline-none ${compact ? "pt-4" : "pt-6"}`}
      >
        {active.content}
      </div>
    </div>
  );
}
