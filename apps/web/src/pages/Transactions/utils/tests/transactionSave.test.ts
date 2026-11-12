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
  amount: "42.5",
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

  describe("buildCreateBody", () => {
    it("sends native amounts as exact decimal strings", () => {
      const body = buildCreateBody({
        ...newTransactionDraft("BTC", "2026-11-05T21:07"),
        name: "Coffee",
        amount: "1.234567890123456789",
        accountAmount: "0.5",
        destinationAmount: "",
        feeAmount: "0.000000000000000001",
        feeCurrency: "BTC"
      });
      expect(body).toMatchObject({
        amount: "1.234567890123456789",
        accountAmount: "0.5",
        feeAmount: "0.000000000000000001",
        feeCurrency: "BTC"
      });
      expect(body).not.toHaveProperty("destinationAmount");
    });
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
        amount: "7"
      });
    });

    it("restates the applied amounts and fee as strings when a coupled field changes", () => {
      const cross = draft({
        amount: "100.5",
        accountAmount: "1700.25",
        destinationAmount: "1650",
        feeAmount: "2",
        feeCurrency: "USD"
      });
      expect(buildUpdateBody(cross, ["amount"], stored)).toEqual({
        amount: "100.5",
        accountAmount: "1700.25",
        destinationAmount: "1650",
        feeAmount: "2",
        feeCurrency: "USD"
      });
    });

    it("omits empty applied amounts so equal currencies stay server-copied", () => {
      expect(buildUpdateBody(draft({ amount: "9" }), ["amount"], stored)).toEqual({ amount: "9" });
    });

    it("sends a fee only with its currency", () => {
      expect(buildUpdateBody(draft({ feeAmount: "2", feeCurrency: "" }), ["feeAmount"], stored)).toEqual({});
    });

    it("clears a stored fee with nulls, and only when one existed", () => {
      const withFee = { ...stored, feeAmount: "2", feeCurrency: "USD" } as Transaction;
      expect(buildUpdateBody(draft({ feeAmount: "", feeCurrency: "" }), ["feeAmount"], withFee)).toEqual({
        feeAmount: null,
        feeCurrency: null
      });
      expect(buildUpdateBody(draft({ feeAmount: "", feeCurrency: "" }), ["feeAmount"], stored)).toEqual({});
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

    it("sends only the changed core fields when sharing is untouched", () => {
      expect(buildUpdateBody(draft({ isShared: true, sharedTitle: "t" }), ["notes"], stored)).not.toHaveProperty("sharedExpense");
    });

    it("sends the whole sharing state in one sharedExpense, by id, userId or manualName and without payment fields", () => {
      const body = buildUpdateBody(
        draft({
          isShared: true,
          sharedTitle: " Trip ",
          participants: [
            { draftId: "p1", id: "p1", userId: "u2", participantName: "Sam", source: "app", shareAmount: "20", paidAmount: "5", status: "partial" },
            { draftId: "x", userId: "u3", participantName: "Kim", source: "app", shareAmount: "7.5" },
            { draftId: "y", participantName: "Pat", source: "manual", shareAmount: "2" }
          ]
        }),
        ["isShared", "participants"],
        stored
      );
      expect(body).toEqual({
        sharedExpense: {
          enabled: true,
          title: "Trip",
          participants: [
            { id: "p1", userId: "u2", share: "20" },
            { userId: "u3", share: "7.5" },
            { manualName: "Pat", share: "2" }
          ]
        }
      });
    });

    it("sends each line of one user as its own entry, ids only on persisted lines", () => {
      const line = (draftId: string, id: string | undefined, share: string) => ({
        draftId,
        ...(id ? { id } : {}),
        userId: "u2",
        participantName: "Sam",
        source: "app" as const,
        shareAmount: share
      });
      const body = buildUpdateBody(
        draft({ isShared: true, participants: [line("p1", "p1", "20"), line("tmp", undefined, "5")] }),
        ["participants"],
        stored
      );
      expect(body).toEqual({
        sharedExpense: {
          enabled: true,
          participants: [
            { id: "p1", userId: "u2", share: "20" },
            { userId: "u2", share: "5" }
          ]
        }
      });
    });

    it("sends enabled:false when sharing is turned off", () => {
      expect(buildUpdateBody(draft({ isShared: false }), ["isShared", "participants"], stored)).toEqual({
        sharedExpense: { enabled: false }
      });
    });
  });

  describe("buildCreateBody", () => {
    const fresh = newTransactionDraft("USD", "2026-11-05T14:30");

    it("sends the whole draft with the date as a UTC instant and no sharedExpense", () => {
      const body = buildCreateBody({ ...fresh, name: "Dinner", amount: "10", notes: "" });
      expect(body).toMatchObject({
        name: "Dinner",
        amount: "10",
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
          { userId: "u2", participantName: "Sam", shareAmount: "50", paidAmount: "0", status: "pending" },
          { userId: null, participantName: "Pat", shareAmount: "20", paidAmount: "0", status: "pending" }
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

    it("maps guard errors to the participant row or the participants list", async () => {
      const cases: [string, string][] = [
        ["sharedExpense.participants.2.share", "participants.2.shareAmount"],
        ["sharedExpense.participants.1.id", "participants.1.shareAmount"],
        ["sharedExpense.participants.removed.0", "participants"],
        ["sharedExpense.participants", "participants"],
        ["type", "type"]
      ];
      for (const [serverField, draftField] of cases) {
        server.use(
          http.put(`${API_URL}/transactions/tx-1`, () =>
            HttpResponse.json({ message: "bad", issues: { fieldErrors: { [serverField]: ["Nope"] } } }, { status: 400 })
          )
        );
        const error = await saveTransactionDraft({
          draft: draft({ isShared: true }),
          changedKeys: ["isShared"],
          original: stored
        }).catch((caught: unknown) => caught);
        expect(error).toMatchObject({ field: draftField, message: "Nope" });
      }
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
