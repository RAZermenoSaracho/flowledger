import type { NotificationCondition, NotificationRule, NotificationRules, NotificationValue } from "@flowledger/shared";

/** Kinds an action can take, in the order the builder offers them. */
export type ActionKind = NotificationRule["action"]["kind"];

/** Extract a money rule starts with when none exists: the first amount with a currency sign. */
const DEFAULT_EXTRACT = {
  pattern: String.raw`\$\s*([\d,]+(?:\.\d{1,2})?)`,
  method: "search" as const,
  ignoreCase: false,
  missingReason: "no amount"
};

/** A fresh rule for "Add rule": one editable keyword condition and a skip action, so it is valid as soon as it is added. */
export function newRule(): NotificationRule {
  return {
    match: "all",
    conditions: [{ kind: "contains", text: "keyword", ignoreCase: true }],
    action: { kind: "skip", reason: "skipped" }
  };
}

/** Appends a rule, keeping a trailing catch-all (a rule without conditions) last. */
export function addRule(rules: NotificationRules): NotificationRules {
  const last = rules.rules[rules.rules.length - 1];
  const list = last && last.conditions.length === 0 ? [...rules.rules.slice(0, -1), newRule(), last] : [...rules.rules, newRule()];
  return { ...rules, rules: list };
}

/** Moves the item at `index` by `delta` positions; out-of-range moves return the list unchanged. */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** A condition of `kind`, keeping the text/pattern and ignore-case the user already typed. */
export function conditionOfKind(kind: NotificationCondition["kind"], previous?: NotificationCondition): NotificationCondition {
  const text = previous ? ("text" in previous ? previous.text : previous.pattern) : "";
  const ignoreCase = previous?.ignoreCase ?? true;
  if (kind === "contains" || kind === "not_contains") return { kind, text, ignoreCase };
  return { kind, pattern: text, method: previous && "method" in previous ? previous.method : "search", ignoreCase };
}

/** Switches a rule's action kind, keeping shared fields and dropping the ones the new kind forbids; money actions get a default extract when the rule has none. */
export function withActionKind(rule: NotificationRule, kind: ActionKind): NotificationRule {
  const current = rule.action;
  if (kind === "skip") return { ...rule, action: { kind, reason: current.kind === "skip" ? current.reason : "skipped" } };
  if (current.kind !== "skip") {
    const { category, group, to_account, ...kept } = current;
    return { ...rule, action: kind === "transfer" ? { ...kept, kind, to_account } : { ...kept, kind, category, group } };
  }
  const amount: NotificationValue = { group: 1 };
  return { ...rule, extract: rule.extract ?? DEFAULT_EXTRACT, action: { kind, amount, name: { fixed: "Notification" } } };
}
