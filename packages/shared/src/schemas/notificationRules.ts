import { z } from "zod";
import { positiveDecimalAmountSchema } from "./common.js";

const slotKey = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{0,39}$/,
    "Slot key must match ^[a-z][a-z0-9_]{0,39}$"
  );
const reason = z.string().min(1).max(200);
const labelSchema = z.string().refine(
  (label) => !["\r", "\n", "\x0b", "\x0c", "\x85", "\u2028", "\u2029"].some((separator) => label.includes(separator)),
  "Label must be a single line"
).pipe(z.string().trim().max(80));
const method = z.enum(["search", "match"]);

/** A literal string or a capture-group index of the rule's extract. */
const valueSchema = z.union([
  z.object({ fixed: z.string().trim().min(1) }).strict(),
  z.object({ group: z.number().int().min(1) }).strict()
]);

const conditionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum(["contains", "not_contains"]),
      text: z.string().min(1),
      ignoreCase: z.boolean()
    })
    .strict(),
  z
    .object({
      kind: z.enum(["matches", "not_matches"]),
      pattern: z.string().min(1),
      method,
      ignoreCase: z.boolean()
    })
    .strict()
]);

const extractSchema = z
  .object({
    pattern: z.string().min(1),
    method,
    ignoreCase: z.boolean(),
    missingReason: reason
  })
  .strict();

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("skip"), reason }).strict(),
  z
    .object({
      kind: z.enum(["expense", "income", "transfer"]),
      amount: valueSchema,
      name: valueSchema,
      account: slotKey.optional(),
      to_account: slotKey.optional(),
      category: slotKey.optional(),
      group: slotKey.optional(),
      currency: valueSchema.optional(),
      notes: valueSchema.optional(),
      date: z
        .object({ group: z.number().int().min(1), format: z.string().min(1) })
        .strict()
        .optional()
    })
    .strict()
]);

const ruleSchema = z
  .object({
    label: labelSchema.optional(),
    match: z.enum(["all", "any"]),
    conditions: z.array(conditionSchema).max(10),
    extract: extractSchema.optional(),
    action: actionSchema
  })
  .strict()
  .superRefine((rule, ctx) => {
    const a = rule.action;
    if (a.kind === "skip") return;
    const issue = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path: ["action", ...path] });
    if (a.kind === "transfer") {
      if (!a.account) issue("Transfer requires account", ["account"]);
      if (!a.to_account) issue("Transfer requires to_account", ["to_account"]);
      if (a.category) issue("Transfer forbids category", ["category"]);
      if (a.group) issue("Transfer forbids group", ["group"]);
    } else if (a.to_account)
      issue("Only transfers take to_account", ["to_account"]);
    if (
      a.amount &&
      "fixed" in a.amount &&
      !positiveDecimalAmountSchema.safeParse(a.amount.fixed).success
    ) {
      issue("Fixed amount must be a decimal string", ["amount"]);
    }
    const needsExtract =
      [a.amount, a.name, a.currency, a.notes].some((v) => v && "group" in v) ||
      a.date;
    if (needsExtract && !rule.extract)
      issue("Capture-group values and date require an extract", ["amount"]);
  });

/** Visual rules model (design §13): the derived, never-stored view of a notification script. */
export const notificationRulesSchema = z
  .object({
    normalize: z.boolean(),
    rules: z.array(ruleSchema).min(1).max(20),
    fallbackReason: reason
  })
  .strict()
  .refine(
    (r) =>
      r.rules.every(
        (rule, i) => rule.conditions.length > 0 || i === r.rules.length - 1
      ),
    {
      message: "Only the last rule may have zero conditions",
      path: ["rules"]
    }
  );

export type NotificationRules = z.infer<typeof notificationRulesSchema>;
export type NotificationRule = NotificationRules["rules"][number];
export type NotificationCondition = NotificationRule["conditions"][number];
export type NotificationValue = z.infer<typeof valueSchema>;

/**
 * Returns a deep copy in the canonical form recovered by parsing generated code.
 * Lower-cases case-insensitive contains/not_contains text and sets zero- and single-condition
 * rules to match "all". All other values are preserved; the input is never mutated.
 */
export function canonicalizeNotificationRules(rules: NotificationRules): NotificationRules {
  const canonical = structuredClone(rules);
  for (const rule of canonical.rules) {
    if (rule.conditions.length <= 1) rule.match = "all";
    for (const condition of rule.conditions) {
      if ((condition.kind === "contains" || condition.kind === "not_contains") && condition.ignoreCase) {
        condition.text = condition.text.toLowerCase();
      }
    }
  }
  return canonical;
}

/** Python string literal with backslash, quote and newline escaping. */
const str = (s: string) =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;

/** Raw literal `r"…"`; falls back to an escaped normal literal when a raw one cannot represent the pattern (contains `"`, a line break, or ends in an odd run of backslashes). */
const pat = (p: string) =>
  /["\n\r]/.test(p) || (p.match(/\\*$/)?.[0].length ?? 0) % 2 === 1
    ? str(p)
    : `r"${p}"`;

const val = (v: NotificationValue) =>
  "fixed" in v ? str(v.fixed) : `m.group(${v.group})`;

const cond = (c: NotificationCondition) => {
  if ("text" in c) {
    const needle = c.ignoreCase ? c.text.toLowerCase() : c.text;
    return `${str(needle)} ${c.kind === "contains" ? "in" : "not in"} ${c.ignoreCase ? "t.lower()" : "t"}`;
  }
  const call = `re.${c.method}(${pat(c.pattern)}, t${c.ignoreCase ? ", re.I" : ""})`;
  return c.kind === "matches" ? call : `not ${call}`;
};

/** Emits the canonical Python script for a rule set; pure and deterministic, the exact inverse of the sandbox parser. */
export function generateNotificationCode(rules: NotificationRules): string {
  const out = [
    "def process(text, ctx):",
    `    t = ${rules.normalize ? "normalize(text)" : "text"}`
  ];
  for (const rule of rules.rules) {
    out.push("");
    const bare = rule.conditions.length === 0;
    const ind = bare ? "    " : "        ";
    if (rule.label) out.push(`    # ${labelSchema.parse(rule.label)}`);
    if (!bare)
      out.push(
        `    if ${rule.conditions.map(cond).join(rule.match === "all" ? " and " : " or ")}:`
      );
    if (rule.extract) {
      const e = rule.extract;
      out.push(
        `${ind}m = re.${e.method}(${pat(e.pattern)}, t${e.ignoreCase ? ", re.I" : ""})`
      );
      out.push(
        `${ind}if not m:`,
        `${ind}    return skip(${str(e.missingReason)})`
      );
    }
    const a = rule.action;
    if (a.kind === "skip") out.push(`${ind}return skip(${str(a.reason)})`);
    else {
      const args = [
        `amount=${"group" in a.amount ? `amount(m.group(${a.amount.group}))` : str(a.amount.fixed)}`,
        `name=${val(a.name)}`,
        a.account && `account=${str(a.account)}`,
        a.to_account && `to_account=${str(a.to_account)}`,
        a.category && `category=${str(a.category)}`,
        a.group && `group=${str(a.group)}`,
        a.currency && `currency=${val(a.currency)}`,
        a.date &&
          `date=parse_date(m.group(${a.date.group}), ${str(a.date.format)})`,
        a.notes && `notes=${val(a.notes)}`
      ].filter(Boolean);
      out.push(`${ind}return ${a.kind}(${args.join(", ")})`);
    }
  }
  out.push("", `    return skip(${str(rules.fallbackReason)})`);
  return out.join("\n") + "\n";
}

/** The starting rule set for a new model: the "Purchase completed for" purchase example. */
export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  normalize: true,
  rules: [
    {
      label: "Purchase",
      match: "all",
      conditions: [
        { kind: "contains", text: "purchase completed for", ignoreCase: false }
      ],
      extract: {
        pattern: String.raw`\$\s*([\d,]+(?:\.\d{1,2})?)`,
        method: "search",
        ignoreCase: false,
        missingReason: "no amount"
      },
      action: {
        kind: "expense",
        amount: { group: 1 },
        name: { fixed: "Purchase completed" }
      }
    }
  ],
  fallbackReason: "not a purchase"
};
