import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test — NOT run in this sandbox (no Docker), see
// docs/TESTING.md. Exercises transactions + shared-expenses + debts +
// notifications together through the real HTTP layer, verifying that
// creating a shared transaction produces a correctly-linked debt for the
// participant and notifications for both sides, and that deleting the
// transaction cascades to clean up the shared expense and its
// notifications (not just the transaction row itself).
let app: Express;

describe("shared expense -> debt -> notification chain", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("creating a shared expense transaction produces a debt for the participant and notifications for both parties", async () => {
    const owner = await createAuthedUser(app);
    const participant = await createAuthedUser(app);

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Dinner", type: "expense" });

    const transactionResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        name: "Dinner out",
        amount: 100,
        type: "expense",
        date: "2024-01-15",
        categoryId: categoryResponse.body.category.id,
        sharedExpense: {
          title: "Dinner split",
          participants: [
            {
              userId: participant.user.id,
              participantName: "Friend",
              shareAmount: 50
            }
          ]
        }
      });
    expect(transactionResponse.status).toBe(201);

    // The participant owes the owner: appears in the participant's iOwe list.
    const participantDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${participant.token}`);
    expect(participantDebts.body.iOwe).toHaveLength(1);
    expect(participantDebts.body.iOwe[0].outstandingAmount).toBe(50);

    // ...and the owner sees it in owedToMe.
    const ownerDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownerDebts.body.owedToMe).toHaveLength(1);

    // Both the participant (added + debt_owes_money) and owner (debt_owed_money)
    // receive notifications.
    const participantNotifications = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${participant.token}`);
    expect(
      participantNotifications.body.notifications.map((n: { type: string }) => n.type)
    ).toEqual(expect.arrayContaining(["shared_expense_added", "debt_owes_money"]));

    const ownerNotifications = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(
      ownerNotifications.body.notifications.map((n: { type: string }) => n.type)
    ).toEqual(expect.arrayContaining(["debt_owed_money"]));
  });

  it("deleting the transaction cascades to remove the shared expense and its notifications", async () => {
    const owner = await createAuthedUser(app);
    const participant = await createAuthedUser(app);

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Trip", type: "expense" });

    const transactionResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        name: "Road trip gas",
        amount: 60,
        type: "expense",
        date: "2024-02-01",
        categoryId: categoryResponse.body.category.id,
        sharedExpense: {
          title: "Gas split",
          participants: [
            {
              userId: participant.user.id,
              participantName: "Friend",
              shareAmount: 30
            }
          ]
        }
      });
    const transactionId = transactionResponse.body.transaction.id as string;
    const sharedExpenseId = transactionResponse.body.transaction.sharedExpense
      .id as string;

    const deleteResponse = await request(app)
      .delete(`/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(deleteResponse.status).toBe(204);

    const getSharedExpenseResponse = await request(app)
      .get(`/shared-expenses/${sharedExpenseId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(getSharedExpenseResponse.status).toBe(404);

    const participantDebts = await request(app)
      .get("/debts")
      .set("Authorization", `Bearer ${participant.token}`);
    expect(participantDebts.body.iOwe).toHaveLength(0);
  });
});
