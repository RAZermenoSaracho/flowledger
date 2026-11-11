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

  it("no longer serves PATCH /users/me/password (moved to /auth/password)", async () => {
    const { token } = await createAuthedUser(app, { password: "originalPassword" });

    const response = await request(app)
      .patch("/users/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: "originalPassword",
        newPassword: "brandNewPassword",
        confirmPassword: "brandNewPassword"
      });

    expect(response.status).toBe(404);
  });

  it("searches by username only (exact first, then prefix), never by email or name, returning public users", async () => {
    const searcher = await createAuthedUser(app);
    const target = await createAuthedUser(app, { name: "Findable Person" });
    const prefixUser = await createAuthedUser(app);
    const set = (token: string, username: string) =>
      request(app)
        .patch("/users/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "N", email: token === target.token ? target.user.email : prefixUser.user.email, username });
    expect((await set(target.token, "findme_a")).status).toBe(200);
    expect((await set(prefixUser.token, "findme_ab")).status).toBe(200);
    const search = (q: string) =>
      request(app).get("/users/search").set("Authorization", `Bearer ${searcher.token}`).query({ q });

    const byUsername = await search("findme_a");
    expect(byUsername.status).toBe(200);
    expect(byUsername.body.users.map((u: { username: string }) => u.username)).toEqual(["findme_a", "findme_ab"]);
    expect(byUsername.body.users[0]).toEqual({ id: target.user.id, username: "findme_a", displayName: null });
    expect(JSON.stringify(byUsername.body)).not.toContain(target.user.email);

    expect((await search(target.user.email)).body.users).toEqual([]);
    expect((await search("Findable")).body.users).toEqual([]);
    expect((await search("fi")).status).toBe(400);
  });

  it("hides users in either block direction from search and lists, creates and removes blocks per caller", async () => {
    const a = await createAuthedUser(app);
    const b = await createAuthedUser(app);
    const c = await createAuthedUser(app);
    const as = (u: { token: string }, req: request.Test) => req.set("Authorization", `Bearer ${u.token}`);

    expect((await as(a, request(app).post("/users/blocks")).send({ userId: b.user.id })).status).toBe(201);
    expect((await as(a, request(app).post("/users/blocks")).send({ userId: b.user.id })).status).toBe(201);
    expect((await as(a, request(app).post("/users/blocks")).send({ userId: a.user.id })).status).toBe(400);
    expect((await as(a, request(app).post("/users/blocks")).send({ userId: "ghost" })).status).toBe(400);

    const list = await as(a, request(app).get("/users/blocks"));
    expect(list.body.blocks).toHaveLength(1);
    expect(list.body.blocks[0].user).toEqual({ id: b.user.id, username: b.user.username, displayName: null });
    expect(JSON.stringify(list.body)).not.toContain(b.user.email);
    expect((await as(b, request(app).get("/users/blocks"))).body.blocks).toEqual([]);

    for (const [searcher, target] of [[a, b], [b, a]] as const) {
      const found = await as(searcher, request(app).get("/users/search")).query({ q: target.user.username });
      expect(found.body.users).toEqual([]);
    }
    const stillFound = await as(c, request(app).get("/users/search")).query({ q: a.user.username });
    expect(stillFound.body.users).toHaveLength(1);

    expect((await as(b, request(app).delete(`/users/blocks/${b.user.id}`))).status).toBe(204);
    expect((await as(a, request(app).get("/users/blocks"))).body.blocks).toHaveLength(1);
    expect((await as(a, request(app).delete(`/users/blocks/${b.user.id}`))).status).toBe(204);
    expect((await as(a, request(app).get("/users/blocks"))).body.blocks).toEqual([]);
  });

  it("reports username availability and validates the username", async () => {
    const a = await createAuthedUser(app);
    const b = await createAuthedUser(app);
    const check = (u: { token: string }, username: string) =>
      request(app).get("/users/username-availability").set("Authorization", `Bearer ${u.token}`).query({ username });

    expect((await check(a, a.user.username.toUpperCase())).body).toEqual({ username: a.user.username, available: true });
    expect((await check(b, a.user.username)).body.available).toBe(false);
    expect((await check(a, "brand_new_name")).body.available).toBe(true);
    expect((await check(a, "admin")).status).toBe(400);
    expect((await request(app).get("/users/username-availability").query({ username: "abc" })).status).toBe(401);
  });

  it("rate limits search and availability per user with 429 and leaves other users unaffected", async () => {
    const heavy = await createAuthedUser(app);
    const other = await createAuthedUser(app);
    let last = 0;
    for (let i = 0; i < 31; i += 1) {
      last = (await request(app).get("/users/search").set("Authorization", `Bearer ${heavy.token}`).query({ q: "nobody" })).status;
    }
    expect(last).toBe(429);
    expect(
      (await request(app).get("/users/search").set("Authorization", `Bearer ${other.token}`).query({ q: "nobody" })).status
    ).toBe(200);

    for (let i = 0; i < 31; i += 1) {
      last = (await request(app).get("/users/username-availability").set("Authorization", `Bearer ${heavy.token}`).query({ username: "abcdef" })).status;
    }
    expect(last).toBe(429);
  });

  it("changes username and visibility through the profile update, normalizing case and returning 409 on a taken name", async () => {
    const a = await createAuthedUser(app);
    const b = await createAuthedUser(app);
    const patch = (u: { token: string; user: { email: string } }, body: object) =>
      request(app).patch("/users/me").set("Authorization", `Bearer ${u.token}`).send({ name: "N", email: u.user.email, ...body });

    const ok = await patch(a, { username: "Renamed.User", identityVisibility: "username_and_name" });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ username: "renamed.user", identityVisibility: "username_and_name" });

    const taken = await patch(b, { username: "RENAMED.user" });
    expect(taken.status).toBe(409);
    expect(taken.body.issues.fieldErrors.username).toHaveLength(1);
    expect((await patch(b, { username: "ab" })).status).toBe(400);
  });
});
