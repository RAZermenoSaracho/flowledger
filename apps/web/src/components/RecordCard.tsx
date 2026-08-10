import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ActionMenu, ActionMenuItem } from "./ActionMenu";
import { Button } from "./Button";

/** One action offered on a `RecordCard`, rendered inline when it fits, and behind a three-dot menu otherwise. */
export type RecordCardAction = {
  key: string;
  label: string;
  onClick: () => void;
  variant?: "secondary" | "danger";
  disabled?: boolean;
};

/**
 * Generic list-row card: leading content, title/subtitle, optional trailing content, and an
 * optional actions list. Model-agnostic — callers supply everything record-specific via props;
 * this component only knows how to lay the pieces out and how to present `actions` (inline, or
 * behind a three-dot menu anchored to the card's top-right corner).
 *
 * The inline-vs-menu choice is a measured width comparison, not a viewport breakpoint: actions
 * render inline only while their natural (unwrapped) width is at most half the card's own
 * rendered width, re-measured via `ResizeObserver` whenever either changes. A card with few/short
 * actions can stay inline at any screen size; a card with many/long actions collapses to the
 * three-dot menu even on a wide screen if inline buttons would dominate the row.
 */
export function RecordCard({
  id,
  leading,
  title,
  subtitle,
  trailing,
  actions,
  actionsLabel = "Actions",
  highlightClassName,
  children,
  className = ""
}: {
  id?: string;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  actions?: RecordCardAction[];
  actionsLabel?: string;
  highlightClassName?: string;
  children?: ReactNode;
  className?: string;
}) {
  const hasActions = Boolean(actions && actions.length > 0);
  const cardRef = useRef<HTMLDivElement>(null);
  const actionsProbeRef = useRef<HTMLDivElement>(null);
  const [showInlineActions, setShowInlineActions] = useState(false);

  useLayoutEffect(() => {
    if (!hasActions) return;
    const card = cardRef.current;
    const probe = actionsProbeRef.current;
    if (!card || !probe) return;

    function recompute() {
      const cardWidth = card!.getBoundingClientRect().width;
      const actionsWidth = probe!.scrollWidth;
      setShowInlineActions(cardWidth > 0 && actionsWidth <= cardWidth * 0.5);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(card);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [hasActions]);

  return (
    <div
      id={id}
      ref={cardRef}
      className={`relative rounded-md border p-3 text-sm ${
        highlightClassName ?? "border-slate-200 dark:border-slate-800"
      } ${className}`}
    >
      <div
        className={`flex flex-wrap items-center gap-3 ${
          hasActions && !showInlineActions ? "pr-11" : ""
        }`}
      >
        {leading}
        <div className="min-w-0 flex-1">
          {title}
          {subtitle}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
        {hasActions ? (
          <div
            className={`shrink-0 flex-wrap gap-2 ${showInlineActions ? "flex" : "hidden"}`}
          >
            {actions!.map((action) => (
              <Button
                key={action.key}
                type="button"
                variant={action.variant === "danger" ? "danger" : "secondary"}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {hasActions ? (
        // Off-flow, invisible twin of the inline actions row above, laid out
        // unwrapped so its natural width is measurable — the source of truth
        // `useLayoutEffect` compares against `cardRef`'s width. Never visible;
        // exists purely so we know how wide the actions WOULD be before
        // deciding whether to actually render them inline.
        <div
          ref={actionsProbeRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 flex flex-nowrap gap-2 whitespace-nowrap"
        >
          {actions!.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant={action.variant === "danger" ? "danger" : "secondary"}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}

      {children}

      {hasActions ? (
        <ActionMenu
          label={actionsLabel}
          className={`absolute right-2 top-2 ${showInlineActions ? "hidden" : ""}`}
        >
          {actions!.map((action) => (
            <ActionMenuItem
              key={action.key}
              variant={action.variant === "danger" ? "danger" : "default"}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </ActionMenuItem>
          ))}
        </ActionMenu>
      ) : null}
    </div>
  );
}
