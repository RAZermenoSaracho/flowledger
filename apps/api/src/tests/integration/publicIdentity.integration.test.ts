import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test (needs Docker, see docs/TESTING.md): no other user's email ever appears
// in group, debt, settlement, shared-expense or search responses; usernames are public identities
// that survive a rename; blocking rejects only proposed shares and leaves accepted ones and Group membership alone.
let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

type Actor = Awaited<ReturnType<typeof createAuthedUser>>;
const as = (u: Actor, req: request.Test) => req.set("Authorization", `Bearer ${u.token}`);

async function shareExpense(owner: Actor, participant: Actor, accept = false) {
  const category = await as(owner, request(app).post("/categories")).send({ name: "Dinner", type: "expense" });
  const transaction = await as(owner, request(app).post("/transactions")).send({
    name: "Dinner",
    amount: 100,
    type: "expense",
    date: "2024-01-15",
    categoryId: category.body.category.id,
    sharedExpense: {
      title: "Dinner split",
      participants: [{ userId: participant.user.id, participantName: "Stale Snapshot", shareAmount: 50 }]
    }
  });
  expect(transaction.status).toBe(201);
  if (accept) {
    const accepted = await as(
      participant,
      request(app).post(`/shared-expenses/${transaction.body.transaction.sharedExpense.id}/accept`)
    );
    expect(accepted.status).toBe(200);
  }
  return { categoryId: category.body.category.id as string, transactionId: transaction.body.transaction.id as string };
}

describe("public identity across modules", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await stopTestDatabase();
  });

  it("never exposes the other user's email or name on groups, debts, settlements, shared expenses or notifications", async () => {
    const owner = await createAuthedUser(app, { name: "Owner Secret" });
    const friend = await createAuthedUser(app, { name: "Friend Secret" });
    const group = await as(owner, request(app).post("/groups")).send({ name: "Trip" });
    const groupId = group.body.group.id as string;
    const added = await as(owner, request(app).post(`/groups/${groupId}/members`)).send({ userId: friend.user.id });
    expect(added.status).toBe(201);

    const { categoryId } = await shareExpense(owner, friend, true);
    const account = await as(friend, request(app).post("/accounts")).send({ name: "Cash", type: "cash" });
    const friendCategory = await as(friend, request(app).post("/categories")).send({ name: "Debts", type: "expense" });
    const debts = await as(friend, request(app).get("/debts"));
    const settlement = await as(
      friend,
      request(app).post(`/debts/${debts.body.iOwe[0].id}/settlement-request`)
    ).send({ amount: 10, accountId: account.body.account.id, categoryId: friendCategory.body.category.id });
    expect(settlement.status).toBe(201);

    const responses = [
      added,
      await as(owner, request(app).get(`/groups/${groupId}`)),
      await as(friend, request(app).get("/groups")),
      await as(owner, request(app).get("/debts")),
      await as(friend, request(app).get("/debts")),
      settlement,
      await as(owner, request(app).get("/shared-expenses")),
      await as(friend, request(app).get("/shared-expenses")),
      await as(owner, request(app).get("/notifications")),
      await as(friend, request(app).get("/notifications")),
      await as(owner, request(app).get("/users/search")).query({ q: friend.user.username })
    ];
    expect(categoryId).toBeTruthy();
    for (const response of responses) {
      expect(response.status).toBeLessThan(300);
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(friend.user.email);
      expect(text).not.toContain(owner.user.email);
    }
    const ownerOnlySeesOwn = JSON.stringify((await as(owner, request(app).get("/debts"))).body);
    expect(ownerOnlySeesOwn).not.toContain("Friend Secret");
    expect(ownerOnlySeesOwn).toContain(`@${friend.user.username}`);
    expect(ownerOnlySeesOwn).not.toContain("Stale Snapshot");
    expect(JSON.stringify(settlement.body)).not.toContain("Friend Secret");
  });

  it("shows Name (@username) only in username_and_name mode and keeps relationships through a rename", async () => {
    const owner = await createAuthedUser(app);
    const friend = await createAuthedUser(app, { name: "Visible Name" });
    await shareExpense(owner, friend, true);
    await as(friend, request(app).patch("/users/me")).send({
      name: "Visible Name",
      email: friend.user.email,
      username: "renamed_friend",
      identityVisibility: "username_and_name"
    });

    const debts = await as(owner, request(app).get("/debts"));
    expect(debts.body.owedToMe).toHaveLength(1);
    expect(debts.body.owedToMe[0].user).toEqual({ id: friend.user.id, username: "renamed_friend", displayName: "Visible Name" });
    expect(debts.body.owedToMe[0].participantName).toBe("Visible Name (@renamed_friend)");
    expect(debts.body.balances[0].person.id).toBe(friend.user.id);
  });

  it("blocking rejects proposed shares only, leaves accepted shares and Group membership, suppresses notifications and refuses invites", async () => {
    const owner = await createAuthedUser(app);
    const blocker = await createAuthedUser(app);
    const group = await as(owner, request(app).post("/groups")).send({ name: "G" });
    const groupId = group.body.group.id as string;
    await as(owner, request(app).post(`/groups/${groupId}/members`)).send({ userId: blocker.user.id });

    const { transactionId } = await shareExpense(owner, blocker);
    const participant = await prisma.sharedExpenseParticipant.findFirstOrThrow({
      where: { userId: blocker.user.id, sharedExpense: { transactionId } }
    });
    await prisma.sharedExpenseParticipant.update({ where: { id: participant.id }, data: { acceptance: "proposed" } });
    const second = await shareExpense(owner, blocker);
    const acceptedRow = await prisma.sharedExpenseParticipant.findFirstOrThrow({
      where: { userId: blocker.user.id, sharedExpense: { transactionId: second.transactionId } }
    });
    await prisma.sharedExpenseParticipant.update({ where: { id: acceptedRow.id }, data: { acceptance: "accepted" } });

    expect((await as(blocker, request(app).post("/users/blocks")).send({ userId: owner.user.id })).status).toBe(201);

    expect((await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: participant.id } })).acceptance).toBe("rejected");
    expect((await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: acceptedRow.id } })).acceptance).toBe("accepted");
    expect(await prisma.groupMember.count({ where: { groupId, userId: blocker.user.id } })).toBe(1);

    const before = await prisma.notification.count({ where: { userId: blocker.user.id } });
    const category = await as(owner, request(app).post("/categories")).send({ name: "Lunch", type: "expense" });
    const refused = await as(owner, request(app).post("/transactions")).send({
      name: "Lunch",
      amount: 20,
      type: "expense",
      date: "2024-01-16",
      categoryId: category.body.category.id,
      sharedExpense: { title: "Lunch", participants: [{ userId: blocker.user.id, participantName: "x", shareAmount: 10 }] }
    });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe("This user can't be invited.");
    expect(await prisma.notification.count({ where: { userId: blocker.user.id } })).toBe(before);

    expect((await as(blocker, request(app).delete(`/users/blocks/${owner.user.id}`))).status).toBe(204);
    expect((await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: participant.id } })).acceptance).toBe("rejected");
  });
});
