import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The limiter is off under NODE_ENV=test because other route suites share one client address.
vi.mock("../../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../config/env.js")>();
  return { env: { ...original.env, NODE_ENV: "development" } };
});

const { app } = await import("../../../app.js");

describe("/providers/webhooks rate limit", () => {
  it("returns 429 past the limit, per address, with no database involved", async () => {
    const send = (address: string) =>
      request(app).get("/providers/webhooks/syncfy").set("X-Forwarded-For", address);

    for (let attempt = 0; attempt < 300; attempt += 1) {
      expect((await send("203.0.113.30")).status).toBe(200);
    }

    expect((await send("203.0.113.30")).status).toBe(429);
    expect((await send("203.0.113.31")).status).toBe(200);
  }, 30_000);
});
