import type { Express } from "express";
import request from "supertest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";

// NOT run in this sandbox (no Docker) — see docs/TESTING.md.
let app: Express;

describe("/currencies routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("does not require authentication", async () => {
    const response = await request(app).get("/currencies");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("fiat");
    expect(response.body).toHaveProperty("crypto");
  });

  it("returns 1 for the same from/to currency without any external lookup", async () => {
    const response = await request(app)
      .get("/currencies/rate")
      .query({ from: "USD", to: "USD" });

    expect(response.status).toBe(200);
    expect(response.body.rate).toBe(1);
  });

  it("rejects a malformed rate query with a 400", async () => {
    const response = await request(app)
      .get("/currencies/rate")
      .query({ from: "U" });

    expect(response.status).toBe(400);
  });

  it("requires authentication for security search", async () => {
    expect((await request(app).get("/currencies/securities").query({ q: "AAPL" })).status).toBe(401);
  });

  it("validates the query and reports search unavailable without a provider key", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    expect((await auth(request(app).get("/currencies/securities"))).status).toBe(400);
    expect((await auth(request(app).get("/currencies/securities").query({ q: "x".repeat(21) }))).status).toBe(400);
    const response = await auth(request(app).get("/currencies/securities").query({ q: "AAPL" }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: false, results: [] });
  });
});
