import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDatabase.js";

// The limiters are off under NODE_ENV=test because other route suites share one client address.
vi.mock("../../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../config/env.js")>();
  return { env: { ...original.env, NODE_ENV: "development" } };
});

let app: Express;

function login(email: string, password: string, address: string) {
  return request(app)
    .post("/auth/login")
    .set("X-Forwarded-For", address)
    .send({ email, password });
}

describe("/auth rate limits", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("limits repeated failures for one pair, without locking the account or counting successes", async () => {
    const email = "limited@example.com";
    const password = "longenoughPassword";
    await request(app)
      .post("/auth/register")
      .set("X-Forwarded-For", "198.51.100.1")
      .send({ name: "Limited", email, password });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await login(email, password, "203.0.113.9")).status).toBe(200);
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await login(email, "wrong-password", "203.0.113.10")).status).toBe(401);
    }

    const limited = await login(email, "wrong-password", "203.0.113.10");
    expect(limited.status).toBe(429);
    expect(limited.body.message).toEqual(expect.any(String));

    expect((await login(email, password, "203.0.113.11")).status).toBe(200);
  }, 60_000);

  it("limits registrations and refreshes per address", async () => {
    const address = "203.0.113.20";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post("/auth/register")
        .set("X-Forwarded-For", address)
        .send({ name: "x", email: `not-an-email-${attempt}`, password: "longenough" });
      statuses.push(response.status);
    }
    expect(statuses.at(-1)).toBe(429);

    let last = 0;
    for (let attempt = 0; attempt < 61; attempt += 1) {
      last = (await request(app).post("/auth/refresh").set("X-Forwarded-For", address)).status;
    }
    expect(last).toBe(429);
  }, 30_000);
});
