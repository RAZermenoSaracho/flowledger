import { describe, expect, it } from "vitest";
import type { Account } from "../../../../types/accounts.types";
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

    it("validates two lines of the same user independently, by row", () => {
      const line = (draftId: string, shareAmount: string, paidAmount?: number) => ({
        draftId,
        userId: "u2",
        participantName: "Sam",
        source: "app" as const,
        shareAmount,
        paidAmount
      });
      const errors = validateTransactionDraft(
        valid({ isShared: true, participants: [line("a", "10", 10), line("b", "")] })
      );
      expect(errors["participants.0.shareAmount"]).toBeUndefined();
      expect(errors["participants.1.shareAmount"]).toBeDefined();
      expect(
        validateTransactionDraft(valid({ isShared: true, participants: [line("a", "5", 10)] }))[
          "participants.0.shareAmount"
        ]
      ).toMatch(/lower than what was paid/);
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

  describe("amount precision and cross-currency fields", () => {
    const account = (id: string, currency: string): Account => ({
      id,
      name: id,
      type: "checking",
      currency,
      initialBalance: "0",
      isArchived: false,
      createdAt: "",
      updatedAt: ""
    });
    const accounts = [account("usd", "USD"), account("mxn", "MXN")];

    it("rejects, never rounds, an amount with more decimals than its currency", () => {
      expect(validateTransactionDraft(valid({ amount: "10.005" })).amount).toMatch(/at most 2/);
      expect(validateTransactionDraft(valid({ executionCurrency: "JPY", amount: "1500.5" })).amount).toMatch(/cannot have decimals/);
      expect(validateTransactionDraft(valid({ executionCurrency: "BTC", amount: "1.234567890123456789" }))).toEqual({});
      expect(validateTransactionDraft(valid({ executionCurrency: "BTC", amount: "1.2345678901234567891" })).amount).toBeDefined();
    });

    it("requires the account amount when the account currency differs", () => {
      const draft = valid({ accountId: "mxn" });
      expect(validateTransactionDraft(draft, accounts).accountAmount).toBe("Enter the amount in MXN");
      expect(validateTransactionDraft({ ...draft, accountAmount: "1700" }, accounts)).toEqual({});
      expect(validateTransactionDraft({ ...draft, accountAmount: "1700.123" }, accounts).accountAmount).toMatch(/at most 2/);
    });

    it("requires the received amount for a cross-currency transfer", () => {
      const draft = valid({ type: "transfer", accountId: "usd", transferToAccountId: "mxn" });
      expect(validateTransactionDraft(draft, accounts).destinationAmount).toBe("Enter the amount in MXN");
      expect(validateTransactionDraft({ ...draft, destinationAmount: "1700" }, accounts)).toEqual({});
    });

    it("needs a currency for a fee and checks its precision", () => {
      const draft = valid({ type: "transfer", accountId: "usd", transferToAccountId: "mxn", destinationAmount: "1700", feeAmount: "2" });
      expect(validateTransactionDraft(draft, accounts).feeCurrency).toBeDefined();
      expect(validateTransactionDraft({ ...draft, feeCurrency: "USD" }, accounts)).toEqual({});
      expect(validateTransactionDraft({ ...draft, feeCurrency: "USD", feeAmount: "2.001" }, accounts).feeAmount).toMatch(/at most 2/);
    });
  });
});
