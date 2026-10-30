import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";

/**
 * Modal that shows a newly created API key exactly once. Escape and backdrop
 * cannot dismiss it; only the "I've saved it" button calls `onClose`. Mount it
 * only while a secret exists so the parent clears the secret on close.
 */
export function ApiKeyRevealDialog({
  secret,
  onClose
}: {
  secret: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopyMessage("Copied to clipboard");
    } catch {
      setCopyMessage("Copy failed; select the key and copy it manually");
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="reveal-title"
      onCancel={(event) => event.preventDefault()}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg bg-white p-6 text-ink backdrop:bg-black/50 dark:bg-slate-900 dark:text-slate-100"
    >
      <h3 id="reveal-title" className="text-lg font-semibold">
        Your new API key
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Copy it now. You will not be able to see it again.
      </p>
      <code className="mt-3 block break-all rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
        {secret}
      </code>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-pine dark:text-emerald-300">
        {copyMessage}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" className="min-h-11" onClick={copy}>
          Copy
        </Button>
        <Button type="button" className="min-h-11" onClick={onClose}>
          I've saved it
        </Button>
      </div>
    </dialog>
  );
}
