import { canonicalizeNotificationRules, DEFAULT_NOTIFICATION_RULES, generateNotificationCode, type NotificationRules } from "@flowledger/shared";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseRules, runScript } from "../runScript.js";

// Fixtures live in packages/shared tests (not exported); a computed specifier keeps them outside this project's tsc rootDir.
const FIXTURES_PATH = fileURLToPath(new URL("../../../../../../../packages/shared/src/schemas/tests/notificationRules.fixtures.ts", import.meta.url));
const { NOTIFICATION_RULE_FIXTURES } = (await import(FIXTURES_PATH)) as { NOTIFICATION_RULE_FIXTURES: NotificationRules[] };

const ctx = { received_at: "2026-01-02T03:04:05Z", settings: {} };
let seq = 0;
const parse = (code: string) => parseRules(code, `parse-user-${seq++}`);
const rulesOf = async (code: string) => {
  const res = await parse(code);
  if (!("rules" in res)) throw new Error(`expected rules, got ${JSON.stringify(res)}`);
  return res.rules;
};
const unsupportedOf = async (code: string) => {
  const res = await parse(code);
  if (!("unsupported" in res)) throw new Error(`expected unsupported, got ${JSON.stringify(res)}`);
  return res.unsupported;
};

const wrap = (body: string, normalize = "t = normalize(text)") =>
  `def process(text, ctx):\n    ${normalize}\n${body}\n    return skip("fallback")\n`;

const HAND_WRITTEN = `
def process(text,   ctx):
    t = normalize( text )   # keep it normalized

    # Purchase
    if 'purchase completed for' in t:   # the trigger
        m = re.search(r'\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)', t)
        if not   m:
            return skip('no amount')
        return expense(name='Purchase completed', amount=amount(m.group(1)))

    return skip('not a purchase')
`;

describe("parseRules (real sandbox)", { timeout: 120_000 }, () => {
  it("round-trips every generated fixture", async () => {
    for (const fixture of [DEFAULT_NOTIFICATION_RULES, ...NOTIFICATION_RULE_FIXTURES]) {
      expect(await rulesOf(generateNotificationCode(fixture))).toEqual(canonicalizeNotificationRules(fixture));
    }
  });

  it("parses generated and hand-written spellings of the design example identically with identical runtime behaviour", async () => {
    const generated = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);
    expect(await rulesOf(generated)).toEqual(DEFAULT_NOTIFICATION_RULES);
    expect(await rulesOf(HAND_WRITTEN)).toEqual(DEFAULT_NOTIFICATION_RULES);

    for (const code of [generated, HAND_WRITTEN]) {
      const hit = await runScript({ code, text: "Purchase completed for $150.00", ctx });
      expect(hit).toMatchObject({ kind: "proposal", proposal: { kind: "expense", amount: "150.00", name: "Purchase completed" } });
      expect(await runScript({ code, text: "hello", ctx })).toMatchObject({ kind: "skip", reason: "not a purchase" });
    }
  });

  it("accepts re.I / re.IGNORECASE / flags=, t.lower(), t = text and any keyword order", async () => {
    const spellings = [", re.I", ", re.IGNORECASE", ", flags=re.I", ", flags=re.IGNORECASE"];
    for (const flag of spellings) {
      const rules = await rulesOf(
        wrap(`    if not re.match(r"x", t${flag}) or "ab" not in t.lower():\n        return expense(notes="n", name="N", amount="1.00")`, "t = text"),
      );
      expect(rules.normalize).toBe(false);
      expect(rules.rules[0]).toMatchObject({
        match: "any",
        conditions: [
          { kind: "not_matches", pattern: "x", method: "match", ignoreCase: true },
          { kind: "not_contains", text: "ab", ignoreCase: true },
        ],
        action: { kind: "expense", amount: { fixed: "1.00" }, name: { fixed: "N" }, notes: { fixed: "n" } },
      });
    }
  });

  it("takes only the comment line directly above a rule as its label", async () => {
    const rules = await rulesOf(
      wrap(`    # not a label\n\n    if "a" in t:\n        return skip("a")\n    # Second\n    if "b" in t:\n        return skip("b")\n    if "c" in t:  # trailing\n        return skip("c")`),
    );
    expect(rules.rules.map((r) => r.label)).toEqual([undefined, "Second", undefined]);
  });

  it("returns validation errors before parsing", async () => {
    const res = await parse("import os\n");
    expect(res).toMatchObject({ errors: [{ line: 1 }] });
    expect(await parse("def process(:\n")).toMatchObject({ errors: [{ message: expect.stringContaining("SyntaxError") }] });
  });

  const cases: [string, string, number][] = [
    ["a loop", wrap(`    for x in text:\n        pass`), 3],
    ["print", wrap(`    print(t)\n    if "a" in t:\n        return skip("a")`), 3],
    ["an unknown call", wrap(`    if len(t) > 3:\n        return skip("a")`), 3],
    ["else", wrap(`    if "a" in t:\n        return skip("a")\n    else:\n        return skip("b")`), 6],
    ["elif", wrap(`    if "a" in t:\n        return skip("a")\n    elif "b" in t:\n        return skip("b")`), 5],
    ["another assignment", wrap(`    x = 1\n    if "a" in t:\n        return skip("a")`), 3],
    ["a ternary", wrap(`    if "a" in t:\n        return expense(amount="1.00", name="a" if t else "b")`), 4],
    ["an f-string", wrap(`    if "a" in t:\n        return expense(amount="1.00", name=f"x{t}")`), 4],
    ["a non-literal string", wrap(`    if t in t:\n        return skip("a")`), 3],
    ["extra helper arguments", wrap(`    if "a" in t:\n        return skip("a", "b")`), 4],
    ["an unsupported keyword", wrap(`    if "a" in t:\n        return expense(amount="1.00", name="a", destination_amount="2")`), 4],
    ["mixed and/or", wrap(`    if "a" in t and "b" in t or "c" in t:\n        return skip("a")`), 3],
    ["unsupported regex flags", wrap(`    if re.search(r"a", t, re.M):\n        return skip("a")`), 3],
    ["an upper-case needle under .lower()", wrap(`    if "A" in t.lower():\n        return skip("a")`), 3],
    ["m.group without an extract", wrap(`    if "a" in t:\n        return expense(amount="1.00", name=m.group(1))`), 4],
  ];
  it.each(cases)("rejects %s with its line number", async (_name, code, line) => {
    const unsupported = await unsupportedOf(code);
    expect(unsupported.map((u) => u.line)).toContain(line);
    expect(unsupported.every((u) => u.message.length > 0)).toBe(true);
  });

  it("rejects a missing final skip, a foreign first statement and extra top-level code", async () => {
    expect(await unsupportedOf(`def process(text, ctx):\n    t = text\n    if "a" in t:\n        return skip("a")\n`)).not.toEqual([]);
    expect(await unsupportedOf(`def process(text, ctx):\n    t = text.strip()\n    return skip("a")\n`)).toEqual([
      expect.objectContaining({ line: 2 }),
    ]);
    expect(await unsupportedOf(`X = 1\ndef process(text, ctx):\n    t = text\n    return skip("a")\n`)).toEqual([
      expect.objectContaining({ line: 1 }),
    ]);
  });

  it("lists every unsupported construct found", async () => {
    const unsupported = await unsupportedOf(wrap(`    for x in text:\n        pass\n    x = 1\n    if len(t):\n        return skip("a")`));
    expect(unsupported.map((u) => u.line)).toEqual(expect.arrayContaining([3, 5, 6]));
  });

  it("reports rules that fail the shared schema as unsupported instead of approximating", async () => {
    const unsupported = await unsupportedOf(wrap(`    if "a" in t:\n        return expense(amount="abc", name="a")`));
    expect(unsupported[0]!.message).toContain("visual editor");
  });

  it("answers 503 when the playground is busy", async () => {
    const { acquirePlaygroundSlot } = await import("../runScript.js");
    const release = acquirePlaygroundSlot("busy-user")!;
    try {
      await expect(parseRules("x", "busy-user")).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      release();
    }
  });
});
