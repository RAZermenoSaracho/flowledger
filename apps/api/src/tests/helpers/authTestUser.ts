import type { Express } from "express";
import request from "supertest";

let counter = 0;

/**
 * Registers a fresh user through the real `POST /auth/register` endpoint
 * against `app` and returns their access token and public record — for
 * integration/e2e tests that need an authenticated caller against a real
 * (testcontainers) database. Each call gets a unique email so tests can run
 * in parallel without colliding.
 */
export async function createAuthedUser(
  app: Express,
  overrides: { email?: string; password?: string; name?: string } = {}
) {
  counter += 1;
  const email = overrides.email ?? `test-user-${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? "Password123!";
  const name = overrides.name ?? "Test User";

  const response = await request(app)
    .post("/auth/register")
    .send({ name, email, password });

  return {
    token: response.body.token as string,
    user: response.body.user as { id: string; email: string; name: string }
  };
}
