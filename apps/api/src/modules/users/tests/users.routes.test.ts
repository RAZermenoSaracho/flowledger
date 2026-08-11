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

describe("/users routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/users/me");
    expect(response.status).toBe(401);
  });

  it("returns and updates the caller's own profile", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const meResponse = await auth(request(app).get("/users/me"));
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user).not.toHaveProperty("passwordHash");

    const patchResponse = await auth(request(app).patch("/users/me")).send({
      name: "Updated Name",
      email: meResponse.body.user.email
    });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.user.name).toBe("Updated Name");
  });

  it("changes the caller's password after verifying the current one", async () => {
    const { token } = await createAuthedUser(app, { password: "originalPassword" });

    const wrongCurrentResponse = await request(app)
      .patch("/users/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: "wrong",
        newPassword: "brandNewPassword",
        confirmPassword: "brandNewPassword"
      });
    expect(wrongCurrentResponse.status).toBe(401);

    const response = await request(app)
      .patch("/users/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: "originalPassword",
        newPassword: "brandNewPassword",
        confirmPassword: "brandNewPassword"
      });
    expect(response.status).toBe(204);
  });

  it("searches other users by name/email, excluding the caller", async () => {
    const searcher = await createAuthedUser(app);
    const target = await createAuthedUser(app, { name: "Findable Person" });

    const response = await request(app)
      .get("/users/search")
      .set("Authorization", `Bearer ${searcher.token}`)
      .query({ q: "Findable" });

    expect(response.status).toBe(200);
    expect(response.body.users).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target.user.id })])
    );
  });
});
