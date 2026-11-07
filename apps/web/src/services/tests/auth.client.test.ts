import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { googleOAuthUrl, login, refreshSession } from "../auth.client";

const API = "http://localhost:4000";
const session = { token: "tok", user: { id: "u1" } };

describe("refreshSession", () => {
  it("returns the session on 200", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.json(session)));
    expect(await refreshSession()).toEqual(session);
  });

  it("returns null on 401", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })));
    expect(await refreshSession()).toBeNull();
  });

  it("throws on 502", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 502 })));
    await expect(refreshSession()).rejects.toMatchObject({ status: 502 });
  });

  it("throws on a network error", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.error()));
    await expect(refreshSession()).rejects.toThrow();
  });
});

describe("login", () => {
  it.each([true, false])("sends keepLoggedIn=%s", async (keepLoggedIn) => {
    let body: unknown;
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(session);
      })
    );
    await login("a@b.c", "pw", keepLoggedIn);
    expect(body).toEqual({ email: "a@b.c", password: "pw", keepLoggedIn });
  });
});

describe("googleOAuthUrl", () => {
  it.each([true, false])("includes keepLoggedIn=%s", (keepLoggedIn) => {
    expect(googleOAuthUrl("/x", keepLoggedIn)).toBe(
      `${API}/auth/google?redirect=%2Fx&keepLoggedIn=${keepLoggedIn}`
    );
  });
});
