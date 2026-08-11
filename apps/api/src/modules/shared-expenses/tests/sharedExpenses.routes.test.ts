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

describe("/shared-expenses routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/shared-expenses");
    expect(response.status).toBe(401);
  });

  it("lists, fetches, updates, and deletes the shared expense created alongside a transaction", async () => {
    const owner = await createAuthedUser(app);
    const participant = await createAuthedUser(app);
    const auth = (req: request.Test) =>
      req.set("Authorization", `Bearer ${owner.token}`);

    const categoryResponse = await auth(request(app).post("/categories")).send({
      name: "Dinner",
      type: "expense"
    });

    const transactionResponse = await auth(
      request(app).post("/transactions")
    ).send({
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
    const sharedExpenseId = transactionResponse.body.transaction.sharedExpense
      .id as string;

    const listResponse = await auth(request(app).get("/shared-expenses"));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.sharedExpenses).toHaveLength(1);

    const getResponse = await auth(
      request(app).get(`/shared-expenses/${sharedExpenseId}`)
    );
    expect(getResponse.status).toBe(200);

    const updateResponse = await auth(
      request(app).put(`/shared-expenses/${sharedExpenseId}`)
    ).send({ title: "Dinner split (renamed)" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.sharedExpense.title).toBe(
      "Dinner split (renamed)"
    );

    const deleteResponse = await auth(
      request(app).delete(`/shared-expenses/${sharedExpenseId}`)
    );
    expect(deleteResponse.status).toBe(204);
  });
});
