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

describe("/groups routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/groups");
    expect(response.status).toBe(401);
  });

  it("creates a group, seeding the owner as an admin member", async () => {
    const { token, user } = await createAuthedUser(app);

    const createResponse = await request(app)
      .post("/groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Roommates" });

    expect(createResponse.status).toBe(201);
    const group = createResponse.body.group;
    expect(group.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: user.id, role: "admin" })
      ])
    );
  });

  it("adds a second member to a group the caller administers", async () => {
    const owner = await createAuthedUser(app);
    const member = await createAuthedUser(app);

    const createResponse = await request(app)
      .post("/groups")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Trip Fund" });
    const groupId = createResponse.body.group.id as string;

    const addMemberResponse = await request(app)
      .post(`/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: member.user.id });

    expect(addMemberResponse.status).toBe(201);

    const getResponse = await request(app)
      .get(`/groups/${groupId}`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(getResponse.status).toBe(200);
  });

  it("rejects adding a member when the caller isn't a group admin", async () => {
    const owner = await createAuthedUser(app);
    const outsider = await createAuthedUser(app);
    const target = await createAuthedUser(app);

    const createResponse = await request(app)
      .post("/groups")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Private Group" });
    const groupId = createResponse.body.group.id as string;

    const response = await request(app)
      .post(`/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ userId: target.user.id });

    expect(response.status).toBe(404);
  });
});
