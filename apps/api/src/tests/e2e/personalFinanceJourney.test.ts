import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// End-to-end test — NOT run in this sandbox (no Docker), see docs/TESTING.md.
// Walks a full request-response flow a real client would make: register,
// log in, set up an account/category, record a transaction, read it back
// via the list/summary/report endpoints, refresh the session, and log out.
let app: Express;

describe("personal finance journey (register -> use -> logout)", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("supports a full register-to-logout session", async () => {
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Journey User",
      email: "journey@example.com",
      password: "longenoughpassword"
    });
    expect(registerResponse.status).toBe(201);
    let accessToken = registerResponse.body.token as string;
    const refreshCookie = registerResponse.headers["set-cookie"]?.[0] as string;

    const accountResponse = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Checking", type: "checking", initialBalance: 500 });
    expect(accountResponse.status).toBe(201);
    const accountId = accountResponse.body.account.id as string;

    const categoryResponse = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Groceries", type: "expense" });
    const categoryId = categoryResponse.body.category.id as string;

    const transactionResponse = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Weekly groceries",
        amount: 85.5,
        type: "expense",
        date: "2024-03-01",
        accountId,
        categoryId
      });
    expect(transactionResponse.status).toBe(201);

    const listResponse = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listResponse.body.data).toHaveLength(1);

    const accountsResponse = await request(app)
      .get("/accounts")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(accountsResponse.body.accounts[0].currentBalance).toBe(500 - 85.5);

    const summaryResponse = await request(app)
      .get("/reports/summary")
      .set("Authorization", `Bearer ${accessToken}`)
      .query({ currency: "USD" });
    expect(summaryResponse.body.summary.totalExpenses).toBe(85.5);

    // Silent session refresh via the httpOnly refresh cookie, exactly like
    // the web app does on an access-token expiry / page reload.
    const refreshResponse = await request(app)
      .post("/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(200);
    accessToken = refreshResponse.body.token as string;

    const meResponse = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe("journey@example.com");

    const logoutResponse = await request(app)
      .post("/auth/logout")
      .set("Cookie", refreshCookie);
    expect(logoutResponse.status).toBe(204);

    // The now-revoked refresh token can no longer mint a new access token.
    const refreshAfterLogout = await request(app)
      .post("/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshAfterLogout.status).toBe(401);
  });
});
