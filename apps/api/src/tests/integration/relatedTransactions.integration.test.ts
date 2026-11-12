import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import {
  startTestDatabase,
  stopTestDatabase
} from "../helpers/testDatabase.js";

let app: Express;
type Actor = Awaited<ReturnType<typeof createAuthedUser>>;
const as = (u: Actor, req: request.Test) =>
  req.set("Authorization", `Bearer ${u.token}`);

async function accountAndCategories(user: Actor) {
  const account = await as(user, request(app).post("/accounts")).send({
    name: "Cash",
    type: "cash"
  });
  const expense = await as(user, request(app).post("/categories")).send({
    name: "Debts out",
    type: "expense"
  });
  const income = await as(user, request(app).post("/categories")).send({
    name: "Debts in",
    type: "income"
  });
  return {
    accountId: account.body.account.id as string,
    expenseId: expense.body.category.id as string,
    incomeId: income.body.category.id as string
  };
}

describe("related transactions of a shared expense", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
  }, 300_000);

  afterAll(async () => {
    const { prisma } = await import("../../db/prisma.js");
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it("lists only the viewer's own settlements on the original and only a summary on a participant's settlement", async () => {
    const { prisma } = await import("../../db/prisma.js");
    const [a, b, c] = [
      await createAuthedUser(app),
      await createAuthedUser(app),
      await createAuthedUser(app)
    ];
    const aData = await accountAndCategories(a);

    const original = await as(a, request(app).post("/transactions")).send({
      name: "Team dinner",
      amount: "90",
      type: "expense",
      date: "2024-01-15",
      accountId: aData.accountId,
      categoryId: aData.expenseId,
      notes: "owner private note",
      sharedExpense: {
        title: "Dinner split",
        participants: [
          { userId: b.user.id, participantName: "B", shareAmount: 30 },
          { userId: c.user.id, participantName: "C", shareAmount: 30 }
        ]
      }
    });
    expect(original.status).toBe(201);
    const originalId = original.body.transaction.id as string;
    const unrelated = await as(a, request(app).post("/transactions")).send({
      name: "Unrelated coffee",
      amount: "3",
      type: "expense",
      date: "2024-01-16",
      accountId: aData.accountId,
      categoryId: aData.expenseId
    });
    expect(unrelated.status).toBe(201);

    const sharedExpenseId = original.body.transaction.sharedExpense
      .id as string;
    const settlementTransactionIds: Record<string, string> = {};
    for (const participant of [b, c]) {
      expect(
        (
          await as(
            participant,
            request(app).post(`/shared-expenses/${sharedExpenseId}/accept`)
          )
        ).status
      ).toBe(200);
      const data = await accountAndCategories(participant);
      const row = await prisma.sharedExpenseParticipant.findFirstOrThrow({
        where: { sharedExpenseId, userId: participant.user.id }
      });
      const created = await as(
        participant,
        request(app).post(`/debts/${row.id}/settlement-request`)
      ).send({
        amount: "30",
        accountId: data.accountId,
        categoryId: data.expenseId
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const approved = await as(
        a,
        request(app).post(
          `/settlements/${created.body.settlementRequest.id}/approve`
        )
      ).send({
        accountId: aData.accountId,
        categoryId: aData.incomeId
      });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      const settled = await prisma.settlementRequest.findUniqueOrThrow({
        where: { id: created.body.settlementRequest.id }
      });
      settlementTransactionIds[participant.user.id] =
        settled.debtorTransactionId!;
    }
    const aSettlementIds = (
      await prisma.settlementRequest.findMany({
        where: { creditorUserId: a.user.id },
        select: { creditorTransactionId: true }
      })
    ).map((r) => r.creditorTransactionId);

    const originalView = await as(
      a,
      request(app).get(`/transactions/${originalId}`)
    );
    expect(originalView.status).toBe(200);
    const original_ = originalView.body.transaction;
    expect(original_.relatedTransactions).toEqual([]);
    const settlements = original_.relatedSettlements as {
      status: string;
      participantId: string;
      counterparty: { id: string };
      transaction: { id: string } | null;
    }[];
    expect(settlements.map((r) => r.counterparty.id).sort()).toEqual(
      [b.user.id, c.user.id].sort()
    );
    expect(settlements.every((r) => r.status === "approved")).toBe(true);
    expect(settlements.map((r) => r.transaction?.id).sort()).toEqual(
      [...aSettlementIds].sort()
    );
    const json = JSON.stringify(original_.relatedSettlements);
    for (const id of Object.values(settlementTransactionIds))
      expect(json).not.toContain(id);
    expect(json).not.toContain(unrelated.body.transaction.id);
    expect(json).not.toContain(originalId);

    const bView = await as(
      b,
      request(app).get(`/transactions/${settlementTransactionIds[b.user.id]}`)
    );
    expect(bView.status).toBe(200);
    expect(bView.body.transaction.relatedTransactions).toEqual([]);
    expect(bView.body.transaction.relatedSettlements).toEqual([]);
    expect(bView.body.transaction.settlementOrigin).toMatchObject({
      title: "Dinner split",
      amount: 90,
      owner: { id: a.user.id }
    });
    const bJson = JSON.stringify(bView.body.transaction);
    for (const secret of [
      originalId,
      "owner private note",
      aData.accountId,
      ...aSettlementIds
    ])
      expect(bJson).not.toContain(secret as string);
    expect(bJson).not.toContain(settlementTransactionIds[c.user.id]);

    const aSettlementView = await as(
      a,
      request(app).get(`/transactions/${aSettlementIds[0]}`)
    );
    expect(
      aSettlementView.body.transaction.relatedTransactions.map(
        (r: { id: string; relation: string }) => [r.id, r.relation]
      )
    ).toEqual([[originalId, "origin"]]);
    expect(aSettlementView.body.transaction.relatedSettlements).toEqual([]);
    expect(
      (await as(c, request(app).get(`/transactions/${originalId}`))).status
    ).toBe(404);
  }, 60_000);
});
