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

describe("/categories routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/categories");
    expect(response.status).toBe(401);
  });

  it("creates, lists, updates, archives, restores, and deletes a personal category", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const createResponse = await auth(
      request(app).post("/categories")
    ).send({ name: "Groceries", type: "expense" });
    expect(createResponse.status).toBe(201);
    const categoryId = createResponse.body.category.id as string;

    const listResponse = await auth(request(app).get("/categories"));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.categories).toHaveLength(1);

    const updateResponse = await auth(
      request(app).put(`/categories/${categoryId}`)
    ).send({ name: "Groceries & Household" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.category.name).toBe("Groceries & Household");

    const archiveResponse = await auth(
      request(app).post(`/categories/${categoryId}/archive`)
    );
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.category.isArchived).toBe(true);

    const restoreResponse = await auth(
      request(app).post(`/categories/${categoryId}/restore`)
    );
    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.category.isArchived).toBe(false);

    const deleteResponse = await auth(
      request(app).delete(`/categories/${categoryId}`)
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("rejects an invalid category type with a 400", async () => {
    const { token } = await createAuthedUser(app);

    const response = await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bad", type: "not-a-real-type" });

    expect(response.status).toBe(400);
  });
});
