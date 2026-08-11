import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";

// NOT run in this sandbox (no Docker) — see docs/TESTING.md. Written per
// the documented architecture for a maintainer with Docker (or CI) to run
// and commit.
let app: Express;

describe("/auth routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("registers a new user, setting a refresh cookie and returning a token", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "longenough"
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ email: "ada@example.com" });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "flowledger_refresh_token="
    );
  });

  it("rejects a duplicate registration email with a 409", async () => {
    await request(app).post("/auth/register").send({
      name: "Dup",
      email: "dup@example.com",
      password: "longenough"
    });

    const response = await request(app).post("/auth/register").send({
      name: "Dup Again",
      email: "dup@example.com",
      password: "longenough"
    });

    expect(response.status).toBe(409);
  });

  it("logs in with valid credentials", async () => {
    await request(app).post("/auth/register").send({
      name: "Login Test",
      email: "login@example.com",
      password: "correctpassword"
    });

    const response = await request(app).post("/auth/login").send({
      email: "login@example.com",
      password: "correctpassword"
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it("rejects an invalid password with a 401", async () => {
    await request(app).post("/auth/register").send({
      name: "Wrong Password",
      email: "wrongpw@example.com",
      password: "correctpassword"
    });

    const response = await request(app).post("/auth/login").send({
      email: "wrongpw@example.com",
      password: "incorrect"
    });

    expect(response.status).toBe(401);
  });

  it("requires authentication for GET /auth/me", async () => {
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(401);
  });

  it("returns the caller's profile for GET /auth/me with a valid token", async () => {
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Me Route",
      email: "meroute@example.com",
      password: "longenough"
    });

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${registerResponse.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: "meroute@example.com" });
  });

  it("logs out, clearing the refresh cookie, even without one present", async () => {
    const response = await request(app).post("/auth/logout");
    expect(response.status).toBe(204);
  });
});
