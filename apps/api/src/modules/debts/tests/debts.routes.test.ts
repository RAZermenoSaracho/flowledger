import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";

// NOT run in this sandbox (no Docker) — see docs/TESTING.md.
let app: Express;

async function createSharedExpenseDebt(owner: { token: string }, participantUserId: string) {
  const categoryResponse = await request(app)
    .post("/categories")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ name: "Dinner", type: "expense" });
  const categoryId = categoryResponse.body.category.id as string;

  const transactionResponse = await request(app)
    .post("/transactions")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({
      name: "Dinner out",
      amount: 100,
      type: "expense",
      date: "2024-01-15",
      categoryId,
      sharedExpense: {
        title: "Dinner split",
        participants: [
          { userId: participantUserId, participantName: "Friend", shareAmount: 50 }
        ]
      }
    });

  return transactionResponse.body.transaction;
}

describe("/debts and /settlements routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/debts");
    expect(response.status).toBe(401);
  });

  it("shows a shared expense as owedToMe for the owner and iOwe for the participant", async () => {
    const owner = await createAuthedUser(app);
    const participant = await createAuthedUser(app);

    await createSharedExpenseDebt(owner, participant.user.id);

    const ownerDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownerDebts.body.owedToMe).toHaveLength(1);

    const participantDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${participant.token}`);
    expect(participantDebts.body.iOwe).toHaveLength(1);
  });

  it("runs a full settlement-request -> approve flow, creating the settlement transactions", async () => {
    const owner = await createAuthedUser(app);
    const participant = await createAuthedUser(app);
    await createSharedExpenseDebt(owner, participant.user.id);

    const participantDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${participant.token}`);
    const debtId = participantDebts.body.iOwe[0].id as string;

    const debtorAccount = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${participant.token}`)
      .send({ name: "Checking", type: "checking" });
    const debtorCategory = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${participant.token}`)
      .send({ name: "Settlements", type: "expense" });

    const settlementRequestResponse = await request(app)
      .post(`/debts/${debtId}/settlement-request`)
      .set("Authorization", `Bearer ${participant.token}`)
      .send({
        amount: 50,
        accountId: debtorAccount.body.account.id,
        categoryId: debtorCategory.body.category.id
      });
    expect(settlementRequestResponse.status).toBe(201);
    const settlementRequestId = settlementRequestResponse.body.settlementRequest
      .id as string;

    const creditorAccount = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Checking", type: "checking" });
    const creditorCategory = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Settlements", type: "income" });

    const approveResponse = await request(app)
      .post(`/settlements/${settlementRequestId}/approve`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        accountId: creditorAccount.body.account.id,
        categoryId: creditorCategory.body.category.id
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.debt.outstandingAmount).toBe(0);
  });

  it("rejects a pending settlement request", async () => {
    const owner = await createAuthedUser(app);
    const participant = await createAuthedUser(app);
    await createSharedExpenseDebt(owner, participant.user.id);

    const participantDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${participant.token}`);
    const debtId = participantDebts.body.iOwe[0].id as string;

    const debtorAccount = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${participant.token}`)
      .send({ name: "Checking", type: "checking" });
    const debtorCategory = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${participant.token}`)
      .send({ name: "Settlements", type: "expense" });

    const settlementRequestResponse = await request(app)
      .post(`/debts/${debtId}/settlement-request`)
      .set("Authorization", `Bearer ${participant.token}`)
      .send({
        amount: 50,
        accountId: debtorAccount.body.account.id,
        categoryId: debtorCategory.body.category.id
      });
    const settlementRequestId = settlementRequestResponse.body.settlementRequest
      .id as string;

    const rejectResponse = await request(app)
      .post(`/settlements/${settlementRequestId}/reject`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.settlementRequest.status).toBe("rejected");
  });
});
