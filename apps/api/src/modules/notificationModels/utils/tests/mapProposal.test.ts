import type { NotificationProposal } from "@flowledger/shared";
import { describe, expect, it } from "vitest";
import { invalidResultMessage, mapProposalToTransactionInput } from "../mapProposal.js";

const slots = [
  { key: "card", kind: "account" as const, label: "Card", required: true },
  { key: "savings", kind: "account" as const, label: "Savings", required: false },
  { key: "general", kind: "category" as const, label: "General", required: false },
  { key: "trip", kind: "group" as const, label: "Trip", required: false }
];
const bindings = { card: "acc-1", savings: "acc-2", general: "cat-1", trip: "grp-1" };
const receivedAt = new Date("2026-11-13T18:04:11.000Z");
type Txn = Exclude<NotificationProposal, { kind: "skip" }>;
const expense: Txn = { kind: "expense", name: "OXXO", amount: "1234.50", currency: "MXN", account: "card", category: "general" };

describe("mapProposalToTransactionInput", () => {
  it("maps an expense, defaulting date to receivedAt", () => {
    expect(mapProposalToTransactionInput(expense, bindings, slots, receivedAt)).toEqual({
      input: {
        name: "OXXO",
        amount: "1234.50",
        type: "expense",
        date: "2026-11-13T18:04:11.000Z",
        executionCurrency: "MXN",
        accountId: "acc-1",
        categoryId: "cat-1"
      }
    });
  });

  it("maps a transfer with destination amount, group, date and notes", () => {
    const result = mapProposalToTransactionInput(
      { kind: "transfer", name: "Ahorro", amount: "500.00", currency: "MXN", account: "card", to_account: "savings", destination_amount: "25.00", date: "2026-01-02", notes: "n", group: "trip" },
      bindings,
      slots,
      receivedAt
    );
    expect(result).toEqual({
      input: expect.objectContaining({
        type: "transfer",
        date: "2026-01-02",
        accountId: "acc-1",
        transferToAccountId: "acc-2",
        groupId: "grp-1",
        destinationAmount: "25.00",
        notes: "n"
      })
    });
  });

  it("reports an unbound slot", () => {
    expect(mapProposalToTransactionInput(expense, { card: "acc-1" }, slots, receivedAt)).toEqual({ missingSlot: "general" });
  });

  it("reports an undeclared slot key", () => {
    expect(mapProposalToTransactionInput({ ...expense, account: "nope" }, bindings, slots, receivedAt)).toEqual({ missingSlot: "nope" });
  });

  it("reports a slot used with the wrong kind", () => {
    expect(mapProposalToTransactionInput({ ...expense, category: "card" }, bindings, slots, receivedAt)).toEqual({ missingSlot: "card" });
  });
});

describe("mapProposalToTransactionInput optional fields", () => {
  it("maps an expense with only amount and name, leaving currency and relations unset", () => {
    const result = mapProposalToTransactionInput({ kind: "expense", name: "OXXO", amount: "1234.50" }, {}, [], receivedAt);
    expect(result).toEqual({
      input: { name: "OXXO", amount: "1234.50", type: "expense", date: "2026-11-13T18:04:11.000Z" }
    });
    expect(result).not.toHaveProperty("input.executionCurrency");
  });

  it("maps an income with an explicit currency and no account", () => {
    expect(mapProposalToTransactionInput({ kind: "income", name: "Pay", amount: "10.00", currency: "EUR" }, {}, [], receivedAt)).toEqual({
      input: expect.objectContaining({ type: "income", executionCurrency: "EUR" })
    });
  });

  it("still reports an explicitly referenced but unbound slot", () => {
    expect(mapProposalToTransactionInput({ kind: "expense", name: "X", amount: "1.00", category: "general" }, {}, slots, receivedAt)).toEqual({
      missingSlot: "general"
    });
  });
});

describe("invalidResultMessage", () => {
  it("names the first issue's field path and message", () => {
    expect(invalidResultMessage({ issues: [{ path: ["amount"], message: "Expected decimal string" }, { path: ["name"], message: "x" }] })).toBe(
      "invalid result: amount: Expected decimal string"
    );
  });

  it("omits an empty path", () => {
    expect(invalidResultMessage({ issues: [{ path: [], message: "Invalid input" }] })).toBe("invalid result: Invalid input");
  });
});
