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

describe("/notifications routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/notifications");
    expect(response.status).toBe(401);
  });

  it("lists a new user's notifications as empty with an unread count of 0", async () => {
    const { token } = await createAuthedUser(app);

    const listResponse = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.notifications).toEqual([]);

    const unreadResponse = await request(app)
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`);
    expect(unreadResponse.status).toBe(200);
    expect(unreadResponse.body.count).toBe(0);
  });

  it("receives a notification when added to a group, and can mark it read", async () => {
    const owner = await createAuthedUser(app);
    const member = await createAuthedUser(app);

    const groupResponse = await request(app)
      .post("/groups")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "Notify Test Group" });
    const groupId = groupResponse.body.group.id as string;

    await request(app)
      .post(`/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ userId: member.user.id });

    const listResponse = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${member.token}`);
    expect(listResponse.body.notifications).toHaveLength(1);
    const notificationId = listResponse.body.notifications[0].id as string;

    const markReadResponse = await request(app)
      .patch(`/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${member.token}`);
    expect(markReadResponse.status).toBe(200);
    expect(markReadResponse.body.notification.readAt).not.toBeNull();
  });
});
