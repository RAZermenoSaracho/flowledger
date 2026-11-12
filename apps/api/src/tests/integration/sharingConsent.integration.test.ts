import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test (needs Docker, see docs/TESTING.md): converting an existing transaction to shared,
// consent (accept/reject/re-proposal), accepted-only counting in debts, the settlement-sensitive guards on every
// entry point, duplicate conversion, and Group data never reaching a participant outside the Group.
let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

type Actor = Awaited<ReturnType<typeof createAuthedUser>>;
const as = (u: Actor, req: request.Test) => req.set("Authorization", `Bearer ${u.token}`);

async function unsharedExpense(owner: Actor, amount = 100) {
  const category = await as(owner, request(app).post("/categories")).send({ name: "Dinner", type: "expense" });
  const transaction = await as(owner, request(app).post("/transactions")).send({
    name: "Dinner",
    amount: String(amount),
    type: "expense",
    date: "2024-01-15",
    categoryId: category.body.category.id
  });
  expect(transaction.status).toBe(201);
  return transaction.body.transaction.id as string;
}

const share = (owner: Actor, transactionId: string, sharedExpense: unknown) =>
  as(owner, request(app).put(`/transactions/${transactionId}`)).send({ sharedExpense });

async function participantRow(transactionId: string, userId: string) {
  return prisma.sharedExpenseParticipant.findFirstOrThrow({ where: { userId, sharedExpense: { transactionId } } });
}

describe("sharing conversion and consent", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it("converts an existing transaction with other edits in one request; app users start proposed, manual accepted", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner);

    const response = await as(owner, request(app).put(`/transactions/${transactionId}`)).send({
      name: "Dinner renamed",
      sharedExpense: {
        enabled: true,
        title: "Dinner split",
        participants: [{ userId: friend.user.id, share: 40 }, { manualName: "Cash Friend", share: 10 }]
      }
    });

    expect(response.status).toBe(200);
    const rows = await prisma.sharedExpenseParticipant.findMany({ where: { sharedExpense: { transactionId } } });
    expect(rows.find((r) => r.userId === friend.user.id)).toMatchObject({ acceptance: "proposed", paidAmount: expect.anything() });
    expect(rows.find((r) => !r.userId)?.acceptance).toBe("accepted");
    const notifications = await as(friend, request(app).get("/notifications"));
    expect(notifications.body.notifications.map((n: { type: string }) => n.type)).toContain("shared_expense_invited");
  });

  it("rejects a transfer, over-allocation and a foreign transaction", async () => {
    const owner = await createAuthedUser(app);
    const stranger = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner, 100);

    const tooMuch = await share(owner, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 150 }] });
    const foreign = await share(stranger, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 10 }] });

    expect(tooMuch.status).toBe(400);
    expect(foreign.status).toBe(404);
    expect(await prisma.sharedExpense.count({ where: { transactionId } })).toBe(0);
  });

  it("counts only accepted shares and lists proposed ones as awaiting acceptance", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner);
    await share(owner, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 40 }] });
    const sharedExpenseId = (await participantRow(transactionId, friend.user.id)).sharedExpenseId;

    for (const user of [owner, friend]) {
      const debts = await as(user, request(app).get("/debts"));
      expect(debts.body.awaitingAcceptance).toHaveLength(1);
      expect(debts.body.iOwe).toHaveLength(0);
      expect(debts.body.owedToMe).toHaveLength(0);
    }

    const account = await as(friend, request(app).post("/accounts")).send({ name: "Cash", type: "cash" });
    const category = await as(friend, request(app).post("/categories")).send({ name: "Debts", type: "expense" });
    const debtId = (await participantRow(transactionId, friend.user.id)).id;
    const early = await as(friend, request(app).post(`/debts/${debtId}/settlement-request`)).send({
      amount: "10",
      accountId: account.body.account.id,
      categoryId: category.body.category.id
    });
    expect(early.status).toBe(400);

    expect((await as(owner, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`))).status).toBe(404);
    const accepted = await as(friend, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`));
    expect(accepted.status).toBe(200);
    expect((await as(friend, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`))).status).toBe(400);

    const friendDebts = await as(friend, request(app).get("/debts"));
    expect(friendDebts.body.iOwe).toHaveLength(1);
    expect(friendDebts.body.iOwe[0]).toMatchObject({ acceptance: "accepted", outstandingAmount: 40 });
    expect(friendDebts.body.awaitingAcceptance).toHaveLength(0);
    expect((await as(owner, request(app).get("/debts"))).body.owedToMe).toHaveLength(1);
    const ownerNotifications = await as(owner, request(app).get("/notifications"));
    expect(ownerNotifications.body.notifications.map((n: { type: string }) => n.type)).toContain("shared_expense_accepted");
  });

  it("re-proposes a raised share, keeps a lowered one, and never lets the owner override a rejection", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner);
    await share(owner, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 40 }] });
    const { id, sharedExpenseId } = await participantRow(transactionId, friend.user.id);
    await as(friend, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`));

    await share(owner, transactionId, { enabled: true, participants: [{ id, userId: friend.user.id, share: 30 }] });
    expect((await participantRow(transactionId, friend.user.id)).acceptance).toBe("accepted");

    await share(owner, transactionId, { enabled: true, participants: [{ id, userId: friend.user.id, share: 50 }] });
    expect((await participantRow(transactionId, friend.user.id)).acceptance).toBe("proposed");
    await as(owner, request(app).put(`/transactions/${transactionId}`)).send({ sharedExpense: { enabled: true, title: "t2", participants: [{ id, userId: friend.user.id, share: 50 }] } });
    const updates = await prisma.notification.count({ where: { userId: friend.user.id, type: "shared_expense_updated", readAt: null } });
    expect(updates).toBe(1);

    await as(friend, request(app).post(`/shared-expenses/${sharedExpenseId}/reject`));
    await share(owner, transactionId, { enabled: true, participants: [{ id, userId: friend.user.id, share: 50 }] });
    expect((await participantRow(transactionId, friend.user.id)).acceptance).toBe("rejected");
    const ownerDebts = await as(owner, request(app).get("/debts"));
    expect(ownerDebts.body.rejectedShares).toHaveLength(1);
    expect(ownerDebts.body.owedToMe).toHaveLength(0);

    await share(owner, transactionId, { enabled: true, participants: [{ id, userId: friend.user.id, share: 45 }] });
    expect((await participantRow(transactionId, friend.user.id)).acceptance).toBe("proposed");
  });

  it("returns 409 for a second conversion", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner);
    await share(owner, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 40 }] });

    const response = await as(owner, request(app).post("/shared-expenses")).send({
      transactionId,
      title: "Again",
      participants: [{ participantName: "Cash", shareAmount: 5 }]
    });

    expect(response.status).toBe(409);
    expect(response.body.message ?? response.body.error).toContain("already shared");
  });

  it("blocks every destructive entry point once a payment exists and preserves payments on a legacy PUT", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner);
    await share(owner, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 40 }] });
    const { id, sharedExpenseId } = await participantRow(transactionId, friend.user.id);
    await as(friend, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`));
    const settled = await as(owner, request(app).post(`/debts/${id}/settle`)).send({});
    expect(settled.status).toBe(200);

    const disable = await share(owner, transactionId, { enabled: false });
    const removeParticipant = await share(owner, transactionId, { enabled: true, participants: [{ manualName: "Other", share: 10 }] });
    const lowerPaid = await share(owner, transactionId, { enabled: true, participants: [{ id, userId: friend.user.id, share: 30 }] });
    const flip = await as(owner, request(app).put(`/transactions/${transactionId}`)).send({ type: "income" });
    const deleteExpense = await as(owner, request(app).delete(`/shared-expenses/${sharedExpenseId}`));
    const deleteTransaction = await as(owner, request(app).delete(`/transactions/${transactionId}`));
    const legacy = await as(owner, request(app).put(`/shared-expenses/${sharedExpenseId}`)).send({
      participants: [{ userId: friend.user.id, participantName: "x", shareAmount: 40, paidAmount: 0, status: "pending" }]
    });

    for (const response of [disable, removeParticipant, lowerPaid, flip, deleteExpense, deleteTransaction]) {
      expect(response.status).toBe(400);
    }
    expect(legacy.status).toBe(200);
    expect(await participantRow(transactionId, friend.user.id)).toMatchObject({ id, status: "paid", acceptance: "accepted" });
    expect(Number((await participantRow(transactionId, friend.user.id)).paidAmount)).toBe(40);
  });

  it("disables sharing when no payment exists, keeping the transaction", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app);
    const transactionId = await unsharedExpense(owner);
    await share(owner, transactionId, { enabled: true, participants: [{ userId: friend.user.id, share: 40 }] });

    expect((await share(owner, transactionId, { enabled: false })).status).toBe(200);

    expect(await prisma.sharedExpense.count({ where: { transactionId } })).toBe(0);
    expect(await prisma.transaction.count({ where: { id: transactionId } })).toBe(1);
  });

  it("gives a participant outside the Group the shared expense and debts but no Group data", async () => {
    const owner = await createAuthedUser(app);
    const outsider = await createAuthedUser(app);
    const group = await as(owner, request(app).post("/groups")).send({ name: "Trip" });
    const groupId = group.body.group.id as string;
    const transaction = await prisma.transaction.create({
      data: { userId: owner.user.id, groupId, name: "Hotel", amount: 100, type: "expense", date: new Date("2024-01-15"), executionCurrency: "USD", amountInPreferredCurrency: 100 }
    });
    const response = await share(owner, transaction.id, { enabled: true, participants: [{ userId: outsider.user.id, share: 30 }] });
    expect(response.status).toBe(200);
    const { sharedExpenseId } = await participantRow(transaction.id, outsider.user.id);
    await as(outsider, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`));

    const groupRoute = await as(outsider, request(app).get(`/groups/${groupId}`));
    const detail = await as(outsider, request(app).get(`/shared-expenses/${sharedExpenseId}`));
    const list = await as(outsider, request(app).get("/shared-expenses"));
    const debts = await as(outsider, request(app).get("/debts"));

    expect(groupRoute.status).toBe(404);
    expect(JSON.stringify(groupRoute.body)).not.toContain("Trip");
    expect(detail.body.sharedExpense.transaction.groupId).toBeNull();
    expect(list.body.sharedExpenses[0].transaction.groupId).toBeNull();
    expect(debts.body.iOwe[0].sharedExpense.transaction.groupId).toBeNull();
    expect(JSON.stringify([detail.body, list.body, debts.body])).not.toContain(groupId);
    expect(JSON.stringify(detail.body)).not.toContain("Trip");
  });
});
