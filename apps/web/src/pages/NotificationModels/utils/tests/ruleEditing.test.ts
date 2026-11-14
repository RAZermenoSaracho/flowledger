import { DEFAULT_NOTIFICATION_RULES, notificationRulesSchema } from "@flowledger/shared";
import { describe, expect, it } from "vitest";
import { addRule, conditionOfKind, moveItem, withActionKind } from "../ruleEditing";

describe("ruleEditing", () => {
  it("adds a valid rule before a trailing catch-all", () => {
    const catchAll = { ...DEFAULT_NOTIFICATION_RULES.rules[0]!, conditions: [] };
    const next = addRule({ ...DEFAULT_NOTIFICATION_RULES, rules: [catchAll] });
    expect(next.rules).toHaveLength(2);
    expect(next.rules[1]).toBe(catchAll);
    expect(notificationRulesSchema.safeParse(next).success).toBe(true);
  });

  it("moves items and ignores out-of-range moves", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it("keeps the typed text when a condition changes kind", () => {
    expect(conditionOfKind("matches", { kind: "contains", text: "abc", ignoreCase: false })).toEqual({
      kind: "matches",
      pattern: "abc",
      method: "search",
      ignoreCase: false
    });
  });

  it("switches action kinds, dropping fields the new kind forbids and adding an extract for money actions", () => {
    const skip = withActionKind({ match: "all", conditions: [], action: { kind: "skip", reason: "x" } }, "expense");
    expect(skip.extract).toBeDefined();
    expect(skip.action).toMatchObject({ name: { fixed: "Notification" } });
    expect(notificationRulesSchema.safeParse({ ...DEFAULT_NOTIFICATION_RULES, rules: [skip] }).success).toBe(true);
    const transfer = withActionKind(
      { ...skip, action: { kind: "expense", amount: { group: 1 }, name: { fixed: "n" }, category: "c", account: "a" } },
      "transfer"
    );
    expect(transfer.action).toEqual({ kind: "transfer", amount: { group: 1 }, name: { fixed: "n" }, account: "a", to_account: undefined });
  });
});
