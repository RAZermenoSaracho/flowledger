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

describe("validateTransactionDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateTransactionDraft(valid())).toEqual({});
  });

  it("rejects a blank name, a missing or non-numeric amount and a bad date", () => {
    expect(validateTransactionDraft(valid({ name: " " })).name).toBeDefined();
    expect(validateTransactionDraft(valid({ amount: "" })).amount).toBeDefined();
    expect(validateTransactionDraft(valid({ amount: "abc" })).amount).toBeDefined();
    expect(validateTransactionDraft(valid({ date: "" })).date).toBeDefined();
  });

  it("requires a different destination account for a transfer", () => {
    const transfer = valid({ type: "transfer", accountId: "a1" });
    expect(validateTransactionDraft(transfer).transferToAccountId).toBe("To account is required for transfers");
    expect(validateTransactionDraft({ ...transfer, transferToAccountId: "a1" }).transferToAccountId).toBe(
      "Source and destination accounts must be different"
    );
    expect(validateTransactionDraft(valid({ type: "transfer" })).accountId).toBeDefined();
    expect(validateTransactionDraft({ ...transfer, transferToAccountId: "a2" })).toEqual({});
  });

  it("ignores a stale destination, category and group outside their type", () => {
    expect(validateTransactionDraft(valid({ transferToAccountId: "a2" }))).toEqual({});
    expect(
      validateTransactionDraft(
        valid({ type: "transfer", accountId: "a1", transferToAccountId: "a2", categoryId: "c1", groupId: "g1" }))
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
      expect(validateTransactionDraft(valid({ isShared: true })).participants).toMatch(/at least one/);
    });

    it("needs positive shares", () => {
      const errors = validateTransactionDraft(
        valid({ isShared: true, participants: [row("a", "10"), row("b", "")] }));
      expect(errors["participants.1.shareAmount"]).toBeDefined();
      expect(errors["participants.0.shareAmount"]).toBeUndefined();
    });

    it("caps shares at the amount", () => {
      expect(
        validateTransactionDraft(valid({ isShared: true, participants: [row("a", "150")] })).participants
      ).toBe("Over by $50.00 — participant shares cannot exceed the transaction amount.");
      expect(
        validateTransactionDraft(valid({ isShared: true, participants: [row("a", "100")] }))
      ).toEqual({});
    });

    it("marks the row whose share first pushes the total over the amount", () => {
      const errors = validateTransactionDraft(
        valid({ isShared: true, participants: [row("a", "60"), row("b", "60")] })
      );
      expect(errors["participants.1.shareAmount"]).toBeDefined();
      expect(errors["participants.0.shareAmount"]).toBeUndefined();
    });

    it("is skipped for transfers", () => {
      expect(
        validateTransactionDraft(valid({ type: "transfer", accountId: "a1", transferToAccountId: "a2", isShared: true }))
      ).toEqual({});
    });
  });
});
