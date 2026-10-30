import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

/** Password row (label, description, action) that opens `ChangePasswordDialog`; shows a confirmation after a successful change and returns focus to the trigger on close. */
export function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.querySelector("button")?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Password</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Use a strong password you do not reuse elsewhere.
          </p>
        </div>
        <div ref={triggerRef} className="flex flex-col sm:shrink-0">
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              setDone(false);
              setOpen(true);
            }}
          >
            Change password
          </Button>
        </div>
      </div>
      {done ? (
        <p role="status" className="mt-3 text-sm text-pine dark:text-emerald-300">
          Password updated
        </p>
      ) : null}
      {open ? (
        <ChangePasswordDialog
          onCancel={close}
          onChanged={() => {
            setDone(true);
            close();
          }}
        />
      ) : null}
    </Card>
  );
}
