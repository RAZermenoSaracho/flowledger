import {
  DEFAULT_NOTIFICATION_RULES,
  type NotificationRules
} from "../notificationRules.js";

/** Diverse valid rule sets for round-trip tests: `parse(generate(rules))` must deep-equal its canonical form. */
export const NOTIFICATION_RULE_FIXTURES: NotificationRules[] = [
  DEFAULT_NOTIFICATION_RULES,
  {
    normalize: false,
    rules: [
      {
        match: "any",
        conditions: [
          { kind: "contains", text: "PROMO", ignoreCase: true },
          {
            kind: "matches",
            pattern: String.raw`^\s*ad\b`,
            method: "match",
            ignoreCase: true
          }
        ],
        action: { kind: "skip", reason: "promotion" }
      },
      {
        label: 'Transfer "own"',
        match: "all",
        conditions: [
          { kind: "contains", text: 'say "hi"\\now', ignoreCase: false },
          { kind: "not_contains", text: "Refund", ignoreCase: true },
          {
            kind: "not_matches",
            pattern: String.raw`fail(ed)?`,
            method: "search",
            ignoreCase: false
          }
        ],
        extract: {
          pattern: String.raw`([\d.]+) to (\d{4}-\d{2}-\d{2})`,
          method: "search",
          ignoreCase: true,
          missingReason: "no data"
        },
        action: {
          kind: "transfer",
          amount: { group: 1 },
          name: { fixed: "Own transfer" },
          account: "checking",
          to_account: "savings",
          currency: { fixed: "MXN" },
          date: { group: 2, format: "%Y-%m-%d" },
          notes: { fixed: "line1\nline2" }
        }
      },
      {
        match: "any",
        conditions: [],
        action: {
          kind: "income",
          amount: { fixed: "150.00" },
          name: { fixed: "Salary" },
          category: "pay",
          group: "home"
        }
      }
    ],
    fallbackReason: "unknown"
  },
  {
    normalize: true,
    rules: [
      {
        match: "any",
        conditions: [
          {
            kind: "matches",
            pattern: String.raw`path\\`,
            method: "search",
            ignoreCase: false
          }
        ],
        extract: {
          pattern: 'say "(\\w+)"',
          method: "match",
          ignoreCase: false,
          missingReason: "none"
        },
        action: {
          kind: "expense",
          amount: { fixed: "9.99" },
          name: { group: 1 },
          notes: { group: 1 },
          currency: { group: 1 }
        }
      }
    ],
    fallbackReason: "other"
  }
];
