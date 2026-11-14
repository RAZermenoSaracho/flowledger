import type { NotificationRules, NotificationSlot } from "@flowledger/shared";
import { useEffect, useState } from "react";
import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import { ModalDialog } from "../../../components/ModalDialog";
import type { useRulesSync } from "../hooks/useRulesSync";
import { addRule, moveItem } from "../utils/ruleEditing";
import { RuleCard } from "./RuleCard";

const REPLACE_TEXT = "This replaces your entire script, including comments and unsupported logic. This cannot be undone after saving.";

/**
 * "Processing rules" section of the Form tab: an ordered rule list that rewrites the draft code on
 * every valid edit, or, when the script cannot be shown as rules, a notice explaining why with an
 * explicit, confirmed "Replace with visual rules" action. Parses the code once on mount.
 */
export function ModelRulesBuilder({ sync, slots }: { sync: ReturnType<typeof useRulesSync>; slots: NotificationSlot[] }) {
  const { state, ensureParsed, applyRules, replaceWithDefault } = sync;
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void ensureParsed();
  }, [ensureParsed]);

  return (
    <section className="grid gap-3" aria-label="Processing rules">
      <h3 className="text-sm font-semibold">Processing rules</h3>
      {state.kind === "loading" ? <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Reading the script...</p> : null}
      {state.kind === "failed" ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">The visual editor could not read the script right now. Try again in a moment.</p>
          <Button type="button" variant="secondary" onClick={() => void ensureParsed()}>
            Try again
          </Button>
        </div>
      ) : null}
      {state.kind === "syntax" ? (
        <div role="alert" className="grid gap-1 text-sm text-red-600 dark:text-red-400">
          <p>The script has a syntax error, so the visual rules are not shown. Fix it in Code.</p>
          <ul>
            {state.items.map((item, index) => (
              <li key={index}>
                Line {item.line}: {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.kind === "unsupported" ? (
        <div className="grid justify-items-start gap-2 text-sm">
          <p role="status">This script uses Python the visual editor can't represent. Edit it in Code.</p>
          <ul className="list-disc pl-5 text-slate-600 dark:text-slate-300">
            {state.items.map((item, index) => (
              <li key={index}>
                Line {item.line}: {item.message}
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Replace with visual rules
          </Button>
        </div>
      ) : null}
      {state.kind === "rules" ? <RulesList rules={state.rules} errors={state.errors} rewritesCode={state.rewritesCode} slots={slots} onChange={applyRules} /> : null}

      {confirming ? (
        <ModalDialog titleId="replace-rules-title" title="Replace with visual rules?" onCancel={() => setConfirming(false)}>
          <p className="mt-2 text-sm">{REPLACE_TEXT}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                replaceWithDefault();
                setConfirming(false);
              }}
            >
              Replace
            </Button>
          </div>
        </ModalDialog>
      ) : null}
    </section>
  );
}

function RulesList({
  rules,
  errors,
  rewritesCode,
  slots,
  onChange
}: {
  rules: NotificationRules;
  errors: string[];
  rewritesCode: boolean;
  slots: NotificationSlot[];
  onChange: (rules: NotificationRules) => void;
}) {
  return (
    <div className="grid gap-3">
      {rewritesCode ? (
        <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Editing the rules rewrites the code in a standard form: comments and custom formatting will be replaced.
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul role="alert" className="grid gap-1 text-sm text-red-600 dark:text-red-400">
          {errors.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
          <li>The code is not updated until these are fixed.</li>
        </ul>
      ) : null}
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={rules.normalize} onChange={(event) => onChange({ ...rules, normalize: event.target.checked })} />
        Ignore upper/lower case and accents in the notification text
      </label>
      {rules.rules.map((rule, index) => (
        <RuleCard
          key={index}
          rule={rule}
          index={index}
          total={rules.rules.length}
          slots={slots}
          onChange={(next) => onChange({ ...rules, rules: rules.rules.map((r, i) => (i === index ? next : r)) })}
          onMove={(delta) => onChange({ ...rules, rules: moveItem(rules.rules, index, delta) })}
          onRemove={() => onChange({ ...rules, rules: rules.rules.filter((_, i) => i !== index) })}
        />
      ))}
      <div>
        <Button type="button" variant="secondary" disabled={rules.rules.length >= 20} onClick={() => onChange(addRule(rules))}>
          Add rule
        </Button>
      </div>
      <TextInput label="Otherwise skip, with reason" value={rules.fallbackReason} onChange={(event) => onChange({ ...rules, fallbackReason: event.target.value })} />
    </div>
  );
}
