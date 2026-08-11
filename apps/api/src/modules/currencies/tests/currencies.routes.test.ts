import type { Express } from "express";
import request from "supertest";
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
});
