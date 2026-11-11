import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Transaction } from "../../../../types/transactions.types";
import type { TransactionDraft } from "../../types/transactions.types";
import { draftFromTransaction, newTransactionDraft } from "../transactionDraft";
import {
  TransactionSaveError,
  buildCreateBody,
  buildUpdateBody,
  saveTransactionDraft
} from "../transactionSave";

const API_URL = "http://localhost:4000";
const stored = {
  id: "tx-1",
  name: "Groceries",
  amount: 42.5,
  executionCurrency: "USD",
  type: "expense",
  date: "2026-05-31T21:33:15.979Z",
  accountId: "acc-1",
  categoryId: "cat-1"
} as Transaction;

describe("transaction save", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Mexico_City";
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  const draft = (overrides: Partial<TransactionDraft> = {}) => ({
    ...draftFromTransaction(stored),
    ...overrides
  });

  describe("buildUpdateBody", () => {
    it("sends only changed fields and leaves date out when untouched", () => {
      expect(buildUpdateBody(draft({ notes: "hi" }), ["notes"], stored)).toEqual({ notes: "hi" });
    });

    it("omits date when changed back to the stored value", () => {
      expect(buildUpdateBody(draft(), ["date"], stored)).toEqual({});
    });

    it("sends a changed date as a UTC instant keeping the stored seconds", () => {
      expect(buildUpdateBody(draft({ date: "2026-06-02T15:33" }), ["date"], stored)).toEqual({
        date: "2026-06-02T21:33:15.979Z"
      });
    });

    it("turns empty ids into null and numbers into numbers", () => {
      expect(buildUpdateBody(draft({ categoryId: "", amount: "7" }), ["categoryId", "amount"], stored)).toEqual({
        categoryId: null,
        amount: 7
      });
    });

    it("sends the type-coupled fields with a type change", () => {
      expect(
        buildUpdateBody(draft({ type: "transfer", categoryId: "", transferToAccountId: "acc-2" }), ["type"], stored)
      ).toEqual({
        type: "transfer",
        transferToAccountId: "acc-2",
        categoryId: null,
        groupId: null
      });
      expect(buildUpdateBody(draft({ transferToAccountId: "acc-2" }), ["type"], stored)).toMatchObject({
        transferToAccountId: null
      });
    });

    it("never sends sharing keys", () => {
      const body = buildUpdateBody(draft({ isShared: true, sharedTitle: "t" }), ["isShared", "sharedTitle", "participants"], stored);
      expect(body).toEqual({});
    });
  });

  describe("buildCreateBody", () => {
    const fresh = newTransactionDraft("USD", "2026-11-05T14:30");

    it("sends the whole draft with the date as a UTC instant and no sharedExpense", () => {
      const body = buildCreateBody({ ...fresh, name: "Dinner", amount: "10", notes: "" });
      expect(body).toMatchObject({
        name: "Dinner",
        amount: 10,
        type: "expense",
        date: "2026-11-05T20:30:00.000Z",
        accountId: null,
        notes: null
      });
      expect(body).not.toHaveProperty("sharedExpense");
    });

    it("nests the sharedExpense for a shared draft, titled after the name by default", () => {
      const body = buildCreateBody({
        ...fresh,
        name: "Dinner",
        amount: "100",
        isShared: true,
        participants: [
          { draftId: "p", userId: "u2", participantName: "Sam", source: "app", shareAmount: "50" },
          { draftId: "q", participantName: "Pat", source: "manual", shareAmount: "20" }
        ]
      });
      expect(body.sharedExpense).toEqual({
        title: "Dinner",
        participants: [
          { userId: "u2", participantName: "Sam", shareAmount: 50, paidAmount: 0, status: "pending" },
          { userId: null, participantName: "Pat", shareAmount: 20, paidAmount: 0, status: "pending" }
        ]
      });
    });

    it("never nests sharing for a transfer", () => {
      expect(buildCreateBody({ ...fresh, type: "transfer", isShared: true })).not.toHaveProperty("sharedExpense");
    });
  });

  describe("saveTransactionDraft", () => {
    it("POSTs once for a new draft and returns the created transaction", async () => {
      let calls = 0;
      server.use(
        http.post(`${API_URL}/transactions`, () => {
          calls += 1;
          return HttpResponse.json({ transaction: { id: "new" } });
        })
      );
      const saved = await saveTransactionDraft({
        draft: newTransactionDraft("USD", "2026-11-05T14:30"),
        changedKeys: [],
        original: null
      });
      expect(saved.id).toBe("new");
      expect(calls).toBe(1);
    });

    it("PUTs once for an existing transaction", async () => {
      let body: unknown;
      server.use(
        http.put(`${API_URL}/transactions/tx-1`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ transaction: stored });
        })
      );
      await saveTransactionDraft({ draft: draft({ notes: "x" }), changedKeys: ["notes"], original: stored });
      expect(body).toEqual({ notes: "x" });
    });

    it("maps a server field error to the draft field", async () => {
      server.use(
        http.put(`${API_URL}/transactions/tx-1`, () =>
          HttpResponse.json(
            { message: "Amount cannot be below the sum of participant shares", issues: { fieldErrors: { amount: ["Too low"] } } },
            { status: 400 }
          )
        )
      );
      const error = await saveTransactionDraft({
        draft: draft({ amount: "1" }),
        changedKeys: ["amount"],
        original: stored
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TransactionSaveError);
      expect(error).toMatchObject({ field: "amount", message: "Too low" });
    });

    it("maps a sharedExpense error to participants", async () => {
      server.use(
        http.post(`${API_URL}/transactions`, () =>
          HttpResponse.json({ message: "bad", issues: { fieldErrors: { sharedExpense: ["Shares too high"] } } }, { status: 400 })
        )
      );
      const error = await saveTransactionDraft({
        draft: newTransactionDraft("USD", "2026-11-05T14:30"),
        changedKeys: [],
        original: null
      }).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ field: "participants", message: "Shares too high" });
    });

    it("rethrows an error that names no field unchanged", async () => {
      server.use(http.put(`${API_URL}/transactions/tx-1`, () => HttpResponse.json({ message: "Conflict" }, { status: 409 })));
      const error = await saveTransactionDraft({
        draft: draft({ notes: "x" }),
        changedKeys: ["notes"],
        original: stored
      }).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ message: "Conflict", status: 409 });
      expect(error).not.toBeInstanceOf(TransactionSaveError);
    });
  });
});
