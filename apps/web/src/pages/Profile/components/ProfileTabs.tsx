import { KeyboardEvent, useRef } from "react";
import { PROFILE_TABS } from "../constants";
import type { ProfileTabId } from "../types/profile.types";

/**
 * WAI-ARIA tablist with roving tabindex. Arrow Left/Right wrap, Home/End jump to the ends; focus
 * and selection move together (automatic activation). Scrolls horizontally on narrow screens.
 */
export function ProfileTabs({
  active,
  onChange
}: {
  active: ProfileTabId;
  onChange: (id: ProfileTabId) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = PROFILE_TABS.length - 1;
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
    const id = PROFILE_TABS[next]!.id;
    onChange(id);
    refs.current[id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      className="flex overflow-x-auto shadow-[inset_0_-1px_0] shadow-slate-200 dark:shadow-slate-700"
    >
      {PROFILE_TABS.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`profile-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`profile-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine dark:focus-visible:ring-emerald-400 ${
              selected
                ? "border-pine text-pine dark:border-emerald-400 dark:text-emerald-300"
                : "border-transparent text-slate-500 hover:text-ink dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
