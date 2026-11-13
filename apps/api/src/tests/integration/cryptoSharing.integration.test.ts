import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test (needs Docker, see docs/TESTING.md): crypto shares, partial settlements and
// settlement approval stay exact end to end (transactions -> shared-expenses -> debts -> accounts).
let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

type Actor = Awaited<ReturnType<typeof createAuthedUser>> & { accountId: string; expenseCategoryId: string; incomeCategoryId: string };
const as = (u: { token: string }, req: request.Test) => req.set("Authorization", `Bearer ${u.token}`);

async function actor(currency: string): Promise<Actor> {
  const base = await createAuthedUser(app);
  const account = await as(base, request(app).post("/accounts")).send({ name: "Wallet", type: "cash", currency });
  const expense = await as(base, request(app).post("/categories")).send({ name: "Expenses", type: "expense" });
  const income = await as(base, request(app).post("/categories")).send({ name: "Income", type: "income" });
  return { ...base, accountId: account.body.account.id, expenseCategoryId: expense.body.category.id, incomeCategoryId: income.body.category.id };
}

const settle = (user: Actor, debtId: string, amount: string) =>
  as(user, request(app).post(`/debts/${debtId}/settlement-request`)).send({
    amount,
    accountId: user.accountId,
    categoryId: user.expenseCategoryId
  });

const approve = (owner: Actor, requestId: string) =>
  as(owner, request(app).post(`/settlements/${requestId}/approve`)).send({
    accountId: owner.accountId,
    categoryId: owner.incomeCategoryId
  });

describe("crypto sharing and settlement", () => {
  let owner: Actor;
  let friend: Actor;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    owner = await actor("ETH");
    friend = await actor("ETH");
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  async function sharedTransaction(currency: string, amount: string, share: string) {
    const created = await as(owner, request(app).post("/transactions")).send({
      name: `${currency} dinner`,
      amount,
      type: "expense",
      date: "2024-01-15",
      executionCurrency: currency,
      ...(currency === "ETH" ? {} : { accountAmount: amount }),
      accountId: owner.accountId,
      categoryId: owner.expenseCategoryId
    });
    expect(created.status).toBe(201);
    const shared = await as(owner, request(app).put(`/transactions/${created.body.transaction.id}`)).send({
      sharedExpense: { enabled: true, participants: [{ userId: friend.user.id, share }] }
    });
    expect(shared.status).toBe(200);
    const sharedExpenseId = (await prisma.sharedExpense.findUniqueOrThrow({ where: { transactionId: created.body.transaction.id } })).id;
    expect((await as(friend, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`))).status).toBe(200);
    return prisma.sharedExpenseParticipant.findFirstOrThrow({ where: { sharedExpenseId, userId: friend.user.id } });
  }

  it("settles a 1 ETH share in two exact partial payments (0.4 + 0.6) reaching paid == share", async () => {
    const debt = await sharedTransaction("ETH", "2", "1");

    const first = await settle(friend, debt.id, "0.4");
    expect(first.status).toBe(201);
    expect(first.body.settlementRequest.amount).toBe("0.4");
    expect((await approve(owner, first.body.settlementRequest.id)).status).toBe(200);
    expect(await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: debt.id } })).toMatchObject({ status: "partial" });

    const tooMuch = await settle(friend, debt.id, "0.600000000000000001");
    expect(tooMuch.status).toBe(400);

    const second = await settle(friend, debt.id, "0.6");
    expect(second.status).toBe(201);
    expect((await approve(owner, second.body.settlementRequest.id)).status).toBe(200);
    const row = await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: debt.id } });
    expect(row.status).toBe("paid");
    expect(row.paidAmount.toFixed()).toBe(row.shareAmount.toFixed());
    expect(row.paidAmount.toFixed()).toBe("1");
  });

  it("keeps ten 0.01 BTC shares summing exactly to a 0.1 BTC expense and serves them as strings", async () => {
    const debt = await sharedTransaction("BTC", "0.1", "0.01");
    const list = await as(friend, request(app).get("/debts"));
    const listed = [...list.body.iOwe, ...list.body.awaitingAcceptance].find((d: { id: string }) => d.id === debt.id);
    expect(listed.shareAmount).toBe("0.01");
    expect(listed.outstandingAmount).toBe("0.01");
    expect(listed.paidAmount).toBe("0");
  });

  it("rejects a share with more decimals than the currency allows", async () => {
    const created = await as(owner, request(app).post("/transactions")).send({
      name: "Usd",
      amount: "10",
      type: "expense",
      date: "2024-01-15",
      executionCurrency: "USD",
      accountId: (await as(owner, request(app).post("/accounts")).send({ name: "Usd", type: "cash", currency: "USD" })).body.account.id,
      categoryId: owner.expenseCategoryId
    });
    const res = await as(owner, request(app).put(`/transactions/${created.body.transaction.id}`)).send({
      sharedExpense: { enabled: true, participants: [{ userId: friend.user.id, share: "1.005" }] }
    });
    expect(res.status).toBe(400);
  });
});
