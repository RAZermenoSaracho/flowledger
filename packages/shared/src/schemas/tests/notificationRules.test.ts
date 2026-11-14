import { describe, expect, it } from "vitest";
import {
  canonicalizeNotificationRules,
  DEFAULT_NOTIFICATION_RULES,
  generateNotificationCode,
  notificationRulesSchema,
  type NotificationRule,
  type NotificationRules
} from "../notificationRules.js";
import { NOTIFICATION_RULE_FIXTURES } from "./notificationRules.fixtures.js";

const rule = (over: Partial<NotificationRule> = {}): NotificationRule => ({
  match: "all",
  conditions: [{ kind: "contains", text: "x", ignoreCase: false }],
  action: { kind: "skip", reason: "r" },
  ...over
});
const one = (r: NotificationRule, normalize = true): NotificationRules => ({
  normalize,
  rules: [r],
  fallbackReason: "fb"
});
const body = (r: NotificationRule) =>
  generateNotificationCode(one(r)).split("\n").slice(3, -3).join("\n");
const extract = {
  pattern: "(\\d+)",
  method: "search" as const,
  ignoreCase: false,
  missingReason: "none"
};
const expense = (a: object) => ({
  kind: "expense" as const,
  amount: { group: 1 },
  name: { fixed: "n" },
  ...a
});

describe("notificationRulesSchema", () => {
  it("accepts the default and every fixture", () => {
    for (const f of [
      DEFAULT_NOTIFICATION_RULES,
      ...NOTIFICATION_RULE_FIXTURES
    ]) {
      expect(notificationRulesSchema.safeParse(f).success).toBe(true);
    }
  });

  it.each([
    ["no rules", { ...DEFAULT_NOTIFICATION_RULES, rules: [] }],
    [
      "21 rules",
      { ...DEFAULT_NOTIFICATION_RULES, rules: Array(21).fill(rule()) }
    ],
    [
      "11 conditions",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [
          rule({
            conditions: Array(11).fill({
              kind: "contains",
              text: "a",
              ignoreCase: false
            })
          })
        ]
      }
    ],
    [
      "zero-condition rule not last",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [rule({ conditions: [] }), rule()]
      }
    ],
    [
      "label > 80",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [rule({ label: "a".repeat(81) })]
      }
    ],
    ["empty fallback", { ...DEFAULT_NOTIFICATION_RULES, fallbackReason: "" }],
    [
      "reason > 200",
      { ...DEFAULT_NOTIFICATION_RULES, fallbackReason: "a".repeat(201) }
    ],
    [
      "bad slot key",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [rule({ extract, action: expense({ category: "Bad Key" }) })]
      }
    ],
    [
      "non-decimal fixed amount",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [rule({ action: expense({ amount: { fixed: "1e3" } }) })]
      }
    ],
    [
      "group without extract",
      { ...DEFAULT_NOTIFICATION_RULES, rules: [rule({ action: expense({}) })] }
    ],
    [
      "group 0",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [rule({ extract, action: expense({ amount: { group: 0 } }) })]
      }
    ],
    [
      "date without extract",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [
          rule({
            action: expense({
              amount: { fixed: "1" },
              date: { group: 1, format: "%Y" }
            })
          })
        ]
      }
    ],
    [
      "transfer missing to_account",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [
          rule({
            action: expense({
              kind: "transfer",
              amount: { fixed: "1" },
              account: "a"
            })
          })
        ]
      }
    ],
    [
      "transfer with category",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [
          rule({
            action: expense({
              kind: "transfer",
              amount: { fixed: "1" },
              account: "a",
              to_account: "b",
              category: "c"
            })
          })
        ]
      }
    ],
    [
      "expense with to_account",
      {
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [
          rule({ action: expense({ amount: { fixed: "1" }, to_account: "b" }) })
        ]
      }
    ]
  ])("rejects %s", (_n, v) => {
    expect(notificationRulesSchema.safeParse(v).success).toBe(false);
  });

  it.each(["\n", "\r", "\x0b", "\x0c", "\x85", "\u2028", "\u2029"])("rejects label separator %j even without prior validation", (separator) => {
    const rules = one(rule({ label: `Label${separator}    return skip("injected")` }));
    expect(notificationRulesSchema.safeParse(rules).success).toBe(false);
    expect(() => generateNotificationCode(rules)).toThrow();
    expect(notificationRulesSchema.safeParse(one(rule({ label: `Label${separator}` }))).success).toBe(false);
  });

  it("trims labels and fixed values", () => {
    const parsed = notificationRulesSchema.parse(one(rule({ label: "  Label  ", action: expense({ amount: { fixed: "1" }, name: { fixed: " Name " } }) })));
    expect(parsed.rules[0]!.label).toBe("Label");
    expect(parsed.rules[0]!.action).toMatchObject({ name: { fixed: "Name" } });
  });

  it.each(["name", "currency", "notes"])("rejects empty fixed %s", (field) => {
    expect(notificationRulesSchema.safeParse(one(rule({ action: expense({ amount: { fixed: "1" }, [field]: { fixed: "  " } }) }))).success).toBe(false);
  });

  it("allows a zero-condition last rule", () => {
    expect(
      notificationRulesSchema.safeParse({
        ...DEFAULT_NOTIFICATION_RULES,
        rules: [rule(), rule({ conditions: [] })]
      }).success
    ).toBe(true);
  });
});

describe("generateNotificationCode", () => {
  it("emits the design example byte-for-byte", () => {
    expect(generateNotificationCode(DEFAULT_NOTIFICATION_RULES)).toBe(
      [
        "def process(text, ctx):",
        "    t = normalize(text)",
        "",
        "    # Purchase",
        '    if "purchase completed for" in t:',
        '        m = re.search(r"\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)", t)',
        "        if not m:",
        '            return skip("no amount")',
        '        return expense(amount=amount(m.group(1)), name="Purchase completed")',
        "",
        '    return skip("not a purchase")',
        ""
      ].join("\n")
    );
  });

  it("is deterministic", () => {
    for (const f of NOTIFICATION_RULE_FIXTURES)
      expect(generateNotificationCode(f)).toBe(
        generateNotificationCode(structuredClone(f))
      );
  });

  it("uses the raw text variable when normalize is false", () => {
    expect(generateNotificationCode(one(rule(), false))).toContain(
      "    t = text\n"
    );
  });

  it("emits every condition kind", () => {
    const c = (kind: string, extra: object) =>
      body(rule({ conditions: [{ kind, ...extra } as never] })).split("\n")[0];
    expect(c("contains", { text: "A", ignoreCase: true })).toBe(
      '    if "a" in t.lower():'
    );
    expect(c("not_contains", { text: "a", ignoreCase: false })).toBe(
      '    if "a" not in t:'
    );
    expect(
      c("matches", { pattern: "a", method: "search", ignoreCase: false })
    ).toBe('    if re.search(r"a", t):');
    expect(
      c("matches", { pattern: "a", method: "match", ignoreCase: true })
    ).toBe('    if re.match(r"a", t, re.I):');
    expect(
      c("not_matches", { pattern: "a", method: "search", ignoreCase: false })
    ).toBe('    if not re.search(r"a", t):');
  });

  it("joins with and / or", () => {
    const conditions = [
      { kind: "contains", text: "a", ignoreCase: false },
      { kind: "not_contains", text: "b", ignoreCase: false }
    ] as NotificationRule["conditions"];
    expect(body(rule({ conditions }))).toContain(
      'if "a" in t and "b" not in t:'
    );
    expect(body(rule({ conditions, match: "any" }))).toContain(
      'if "a" in t or "b" not in t:'
    );
  });

  it("emits a zero-condition last rule unindented", () => {
    expect(
      body(rule({ conditions: [], action: { kind: "skip", reason: "z" } }))
    ).toBe('    return skip("z")');
  });

  it("emits extract options and skip action", () => {
    const out = body(
      rule({ extract: { ...extract, method: "match", ignoreCase: true } })
    );
    expect(out).toContain('        m = re.match(r"(\\d+)", t, re.I)');
    expect(out).toContain('            return skip("none")');
  });

  it("emits keyword order, fixed amount, date and values", () => {
    const out = body(
      rule({
        extract,
        action: {
          kind: "transfer",
          notes: { group: 1 },
          date: { group: 1, format: "%d/%m" },
          currency: { fixed: "USD" },
          to_account: "b",
          account: "a",
          name: { group: 1 },
          amount: { fixed: "150.00" }
        } as never
      })
    );
    expect(out).toContain(
      '        return transfer(amount="150.00", name=m.group(1), account="a", to_account="b", currency="USD", date=parse_date(m.group(1), "%d/%m"), notes=m.group(1))'
    );
  });

  it("emits expense category and group after account", () => {
    expect(
      body(
        rule({
          extract,
          action: expense({ group: "g", category: "c", account: "a" })
        })
      )
    ).toContain(
      'amount=amount(m.group(1)), name="n", account="a", category="c", group="g")'
    );
  });

  it("escapes quotes, backslashes and newlines in text", () => {
    const out = body(
      rule({
        conditions: [{ kind: "contains", text: 'a"b\\c\nd', ignoreCase: false }]
      })
    );
    expect(out).toContain('if "a\\"b\\\\c\\nd" in t:');
  });

  it("uses raw patterns, falling back to escaped literals for quotes, newlines and trailing odd backslash", () => {
    const pattern = (p: string) =>
      body(
        rule({
          conditions: [
            { kind: "matches", pattern: p, method: "search", ignoreCase: false }
          ]
        })
      ).split("\n")[0];
    expect(pattern("a\\d")).toBe('    if re.search(r"a\\d", t):');
    expect(pattern('a"b')).toBe('    if re.search("a\\"b", t):');
    expect(pattern("a\\")).toBe('    if re.search("a\\\\", t):');
    expect(pattern("a\\\\")).toBe('    if re.search(r"a\\\\", t):');
    expect(pattern("a\nb")).toBe('    if re.search("a\\nb", t):');
  });

  it("separates rules and fallback with blank lines and labels rules", () => {
    const code = generateNotificationCode({
      normalize: true,
      rules: [rule({ label: "One" }), rule()],
      fallbackReason: "fb"
    });
    expect(code).toBe(
      'def process(text, ctx):\n    t = normalize(text)\n\n    # One\n    if "x" in t:\n        return skip("r")\n\n    if "x" in t:\n        return skip("r")\n\n    return skip("fb")\n'
    );
  });
});


describe("canonicalizeNotificationRules", () => {
  it("only lower-cases case-insensitive text and canonicalizes zero- and single-condition matches", () => {
    const rules: NotificationRules = {
      normalize: false,
      rules: [
        rule({ match: "any", conditions: [{ kind: "contains", text: "CAFÉ", ignoreCase: true }] }),
        rule({ match: "any", conditions: [
          { kind: "not_contains", text: "REFUND", ignoreCase: true },
          { kind: "contains", text: "Keep", ignoreCase: false },
          { kind: "not_contains", text: "Also Keep", ignoreCase: false },
          { kind: "matches", pattern: "ABC", method: "search", ignoreCase: true },
          { kind: "not_matches", pattern: "DEF", method: "match", ignoreCase: true }
        ] }),
        rule({ match: "any", conditions: [] })
      ],
      fallbackReason: "Keep Fallback"
    };
    const expected = structuredClone(rules);
    expected.rules[0]!.match = "all";
    expected.rules[2]!.match = "all";
    const first = expected.rules[0]!.conditions[0]!;
    const second = expected.rules[1]!.conditions[0]!;
    if ("text" in first) first.text = "café";
    if ("text" in second) second.text = "refund";
    expect(canonicalizeNotificationRules(rules)).toEqual(expected);
    expect(rules.rules[0]!.match).toBe("any");
    expect(rules.rules[0]!.conditions[0]).toMatchObject({ text: "CAFÉ" });
  });

  it("preserves generated code, is idempotent, and deeply copies every fixture", () => {
    const assertDeepCopy = (copy: unknown, original: unknown) => {
      if (original === null || typeof original !== "object") return;
      expect(copy).not.toBe(original);
      for (const key of Object.keys(original)) {
        assertDeepCopy((copy as Record<string, unknown>)[key], (original as Record<string, unknown>)[key]);
      }
    };
    for (const fixture of NOTIFICATION_RULE_FIXTURES) {
      const before = structuredClone(fixture);
      const canonical = canonicalizeNotificationRules(fixture);
      expect(generateNotificationCode(fixture)).toBe(generateNotificationCode(canonical));
      expect(canonicalizeNotificationRules(canonical)).toEqual(canonical);
      assertDeepCopy(canonical, fixture);
      expect(fixture).toEqual(before);
    }
  });
});
