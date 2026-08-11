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

describe("/transactions routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/transactions");
    expect(response.status).toBe(401);
  });

  it("creates, lists, fetches, updates, and deletes a transaction", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const accountResponse = await auth(request(app).post("/accounts")).send({
      name: "Checking",
      type: "checking"
    });
    const categoryResponse = await auth(request(app).post("/categories")).send({
      name: "Groceries",
      type: "expense"
    });

    const createResponse = await auth(request(app).post("/transactions")).send({
      name: "Groceries",
      amount: 42.5,
      type: "expense",
      date: "2024-01-15",
      accountId: accountResponse.body.account.id,
      categoryId: categoryResponse.body.category.id
    });
    expect(createResponse.status).toBe(201);
    const transactionId = createResponse.body.transaction.id as string;

    const listResponse = await auth(request(app).get("/transactions"));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const getResponse = await auth(
      request(app).get(`/transactions/${transactionId}`)
    );
    expect(getResponse.status).toBe(200);

    const summaryResponse = await auth(request(app).get("/transactions/summary"));
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({ income: 0, expenses: 42.5 });

    const updateResponse = await auth(
      request(app).put(`/transactions/${transactionId}`)
    ).send({ amount: 50 });
    expect(updateResponse.status).toBe(200);

    const deleteResponse = await auth(
      request(app).delete(`/transactions/${transactionId}`)
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects a transfer with the same source and destination account", async () => {
    const { token } = await createAuthedUser(app);
    const accountResponse = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Checking", type: "checking" });
    const accountId = accountResponse.body.account.id as string;

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Bad transfer",
        amount: 10,
        type: "transfer",
        date: "2024-01-15",
        accountId,
        transferToAccountId: accountId
      });

    expect(response.status).toBe(400);
  });
});
