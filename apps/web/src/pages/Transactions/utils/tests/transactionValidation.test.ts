import { describe, expect, it } from "vitest";
import type { TransactionDraft } from "../../types/transactions.types";
import { newTransactionDraft } from "../transactionDraft";
import { validateTransactionDraft } from "../transactionValidation";

const valid = (overrides: Partial<TransactionDraft> = {}): TransactionDraft => ({
  ...newTransactionDraft("USD", "2026-11-05T21:07"),
  name: "Dinner",
  amount: "100",
  ...overrides
});
const newDraft = { validateSharing: true };

describe("validateTransactionDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateTransactionDraft(valid(), newDraft)).toEqual({});
  });

  it("rejects a blank name, a missing or non-numeric amount and a bad date", () => {
    expect(validateTransactionDraft(valid({ name: " " }), newDraft).name).toBeDefined();
    expect(validateTransactionDraft(valid({ amount: "" }), newDraft).amount).toBeDefined();
    expect(validateTransactionDraft(valid({ amount: "abc" }), newDraft).amount).toBeDefined();
    expect(validateTransactionDraft(valid({ date: "" }), newDraft).date).toBeDefined();
  });

  it("requires a different destination account for a transfer", () => {
    const transfer = valid({ type: "transfer", accountId: "a1" });
    expect(validateTransactionDraft(transfer, newDraft).transferToAccountId).toBe("To account is required for transfers");
    expect(validateTransactionDraft({ ...transfer, transferToAccountId: "a1" }, newDraft).transferToAccountId).toBe(
      "Source and destination accounts must be different"
    );
    expect(validateTransactionDraft(valid({ type: "transfer" }), newDraft).accountId).toBeDefined();
    expect(validateTransactionDraft({ ...transfer, transferToAccountId: "a2" }, newDraft)).toEqual({});
  });

  it("ignores a stale destination, category and group outside their type", () => {
    expect(validateTransactionDraft(valid({ transferToAccountId: "a2" }), newDraft)).toEqual({});
    expect(
      validateTransactionDraft(
        valid({ type: "transfer", accountId: "a1", transferToAccountId: "a2", categoryId: "c1", groupId: "g1" }),
        newDraft
      )
    ).toEqual({});
  });

  describe("sharing", () => {
    const row = (draftId: string, shareAmount: string) => ({
      draftId,
      participantName: draftId,
      source: "manual" as const,
      shareAmount
    });

    it("needs a participant", () => {
      expect(validateTransactionDraft(valid({ isShared: true }), newDraft).participants).toMatch(/at least one/);
    });

    it("needs positive shares", () => {
      const errors = validateTransactionDraft(
        valid({ isShared: true, participants: [row("a", "10"), row("b", "")] }),
        newDraft
      );
      expect(errors["participants.1.shareAmount"]).toBeDefined();
      expect(errors["participants.0.shareAmount"]).toBeUndefined();
    });

    it("caps shares at the amount", () => {
      expect(
        validateTransactionDraft(valid({ isShared: true, participants: [row("a", "150")] }), newDraft).participants
      ).toBe("Over by $50.00 — participant shares cannot exceed the transaction amount.");
      expect(
        validateTransactionDraft(valid({ isShared: true, participants: [row("a", "100")] }), newDraft)
      ).toEqual({});
    });

    it("is skipped for existing transactions and for transfers", () => {
      expect(validateTransactionDraft(valid({ isShared: true }), { validateSharing: false })).toEqual({});
      expect(
        validateTransactionDraft(valid({ type: "transfer", accountId: "a1", transferToAccountId: "a2", isShared: true }), newDraft)
      ).toEqual({});
    });
  });
});
