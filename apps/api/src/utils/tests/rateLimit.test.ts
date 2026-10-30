import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../rateLimit.js";

function appWithLimit(limit: number) {
  const app = express();
  app.use(createRateLimiter({ windowMs: 60_000, limit }));
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("createRateLimiter", () => {
  it("shares a bucket for the same token and separates different tokens", async () => {
    const app = appWithLimit(1);

    expect((await request(app).get("/").set("Authorization", "Bearer a")).status).toBe(200);
    expect((await request(app).get("/").set("Authorization", "Bearer a")).status).toBe(429);
    expect((await request(app).get("/").set("Authorization", "Bearer b")).status).toBe(200);
  });

  it("falls back to the client IP without a token", async () => {
    const app = appWithLimit(1);

    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).get("/")).status).toBe(429);
  });
});
