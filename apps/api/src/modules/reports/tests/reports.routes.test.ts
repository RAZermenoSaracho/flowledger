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

describe("/reports routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/reports/summary");
    expect(response.status).toBe(401);
  });

  it("returns a zeroed summary for a user with no transactions", async () => {
    const { token } = await createAuthedUser(app);

    const response = await request(app)
      .get("/reports/summary")
      .set("Authorization", `Bearer ${token}`)
      .query({ currency: "USD" });

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      totalIncome: 0,
      totalExpenses: 0,
      currentBalance: 0
    });
  });

  it("reflects a created transaction in the by-category and monthly-cashflow reports", async () => {
    const { token } = await createAuthedUser(app);

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Salary", type: "income" });
    const categoryId = categoryResponse.body.category.id as string;

    await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Paycheck",
        amount: 1000,
        type: "income",
        date: "2024-01-15",
        categoryId
      });

    const byCategoryResponse = await request(app)
      .get("/reports/by-category")
      .set("Authorization", `Bearer ${token}`)
      .query({ currency: "USD" });
    expect(byCategoryResponse.status).toBe(200);
    expect(byCategoryResponse.body.incomeCategories).toHaveLength(1);

    const cashflowResponse = await request(app)
      .get("/reports/monthly-cashflow")
      .set("Authorization", `Bearer ${token}`)
      .query({ currency: "USD" });
    expect(cashflowResponse.status).toBe(200);
    expect(cashflowResponse.body.cashflow).toHaveLength(1);
    expect(cashflowResponse.body.cashflow[0]).toMatchObject({ income: 1000 });
  });
});
