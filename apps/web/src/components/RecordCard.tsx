import type { ReactNode } from "react";
import { ActionMenu, ActionMenuItem } from "./ActionMenu";
import { Button } from "./Button";

/** One action offered on a `RecordCard`, rendered inline on desktop and behind the mobile three-dot menu. */
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
 * this component only knows how to lay the pieces out and how to present `actions` (inline on
 * desktop, behind a three-dot menu anchored to the card's top-right corner on mobile).
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

  return (
    <div
      id={id}
      className={`relative rounded-md border p-3 text-sm ${
        highlightClassName ?? "border-slate-200 dark:border-slate-800"
      } ${className}`}
    >
      <div
        className={`flex flex-wrap items-center gap-3 ${
          hasActions ? "pr-11 lg:pr-0" : ""
        }`}
      >
        {leading}
        <div className="min-w-0 flex-1">
          {title}
          {subtitle}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
        {hasActions ? (
          <div className="hidden shrink-0 flex-wrap gap-2 lg:flex">
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

      {children}

      {hasActions ? (
        <ActionMenu label={actionsLabel} className="absolute right-2 top-2">
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
