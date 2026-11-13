import { ArrowLeft } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

/** Arranges the form title, optional back link and action slot in the shared header layout. */
export function FormViewHeader({
  title,
  subtitle,
  backLink,
  onBackClick,
  actions
}: {
  title: string;
  subtitle?: string;
  backLink?: { to: string; label: string };
  onBackClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  actions?: ReactNode;
}) {
  const titleBlock = (
    <div className="min-w-0 flex-1">
      <h1 className="break-words text-xl font-semibold">{title}</h1>
      {subtitle ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );

  return (
    <header className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        {backLink ? (
          <Link
            to={backLink.to}
            aria-label={backLink.label}
            title={backLink.label}
            onClick={onBackClick}
            className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 dark:text-emerald-300 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-slate-950"
          >
            <ArrowLeft
              className="h-5 w-5"
              strokeWidth={2.5}
              aria-hidden="true"
            />
          </Link>
        ) : (
          titleBlock
        )}
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {backLink ? titleBlock : null}
    </header>
  );
}
