import { useState } from "react";
import { Button } from "./Button";

/**
 * Compact secondary button that copies `value` to the clipboard. `label` is its accessible name
 * (e.g. "Copy MCP URL"). Result is announced through a polite live region; a failed write asks
 * the user to copy manually.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Button type="button" variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => void copy()}>
        {label}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400">
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed — select and copy manually" : ""}
      </span>
    </span>
  );
}
