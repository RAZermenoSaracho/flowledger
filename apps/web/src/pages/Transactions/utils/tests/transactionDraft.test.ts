import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "../../../../types/transactions.types";
import {
  draftFromTransaction,
  newTransactionDraft,
  canRemoveParticipant,
  isShareLocked,
  sumParticipantShares
} from "../transactionDraft";

const transaction = {
  id: "tx-1",
  name: "Groceries",
  amount: 42.5,
  executionCurrency: "USD",
  type: "expense",
  date: "2026-05-31T21:33:15.979Z",
  accountId: "acc-1",
  categoryId: "cat-1",
  notes: null
} as Transaction;

describe("transaction draft helpers", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Mexico_City";
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("maps a stored transaction to a draft with empty strings for unset ids", () => {
    expect(draftFromTransaction(transaction)).toEqual({
      name: "Groceries",
      amount: "42.5",
      executionCurrency: "USD",
      type: "expense",
      date: "2026-05-31T15:33",
      accountId: "acc-1",
      transferToAccountId: "",
      categoryId: "cat-1",
      groupId: "",
      notes: "",
      isShared: false,
      sharedTitle: "",
      participants: []
    });
  });

  it("maps a shared expense to the sharing fields", () => {
    const draft = draftFromTransaction({
      ...transaction,
      sharedExpense: {
        title: "Split",
        participants: [
          {
            id: "p1",
            userId: "u2",
            participantName: "Sam",
            shareAmount: 20,
            paidAmount: 5,
            status: "partial",
            acceptance: "accepted"
          },
          {
            id: "p2",
            userId: null,
            participantName: "Pat",
            shareAmount: 5,
            paidAmount: 0,
            status: "pending",
            acceptance: "accepted"
          }
        ]
      }
    } as unknown as Transaction);

    expect(draft.isShared).toBe(true);
    expect(draft.sharedTitle).toBe("Split");
    expect(draft.participants).toEqual([
      {
        draftId: "p1",
        id: "p1",
        userId: "u2",
        participantName: "Sam",
        source: "app",
        shareAmount: "20",
        paidAmount: 5,
        status: "partial",
        acceptance: "accepted"
      },
      {
        draftId: "p2",
        id: "p2",
        userId: null,
        participantName: "Pat",
        source: "manual",
        shareAmount: "5",
        paidAmount: 0,
        status: "pending",
        acceptance: "accepted"
      }
    ]);
  });

  it("builds a new draft with defaults overlaid by the prefill", () => {
    const draft = newTransactionDraft("USD", "2026-11-05T21:07", {
      name: "Lunch",
      type: "income"
    });
    expect(draft).toMatchObject({
      name: "Lunch",
      type: "income",
      executionCurrency: "USD",
      date: "2026-11-05T21:07",
      amount: "",
      isShared: false,
      participants: []
    });
  });

  it("sums shares, ignoring blanks and non-numbers", () => {
    const row = (shareAmount: string) => ({
      draftId: shareAmount,
      participantName: "x",
      source: "manual" as const,
      shareAmount
    });
    expect(
      sumParticipantShares([row("10"), row(""), row("abc"), row("2.5")])
    ).toBe(12.5);
  });

  it("locks a fully paid share and blocks removing a paid row", () => {
    const row = {
      draftId: "a",
      participantName: "A",
      source: "app" as const,
      shareAmount: "10"
    };
    expect(isShareLocked({ ...row, paidAmount: 10, status: "paid", acceptance: "accepted" })).toBe(
      true
    );
    expect(isShareLocked({ ...row, paidAmount: 10, status: "paid", acceptance: "proposed" })).toBe(
      false
    );
    expect(isShareLocked({ ...row, paidAmount: 4, status: "partial" })).toBe(
      false
    );
    expect(isShareLocked(row)).toBe(false);
    expect(canRemoveParticipant({ ...row, paidAmount: 4 })).toBe(false);
    expect(canRemoveParticipant(row)).toBe(true);
  });
});
