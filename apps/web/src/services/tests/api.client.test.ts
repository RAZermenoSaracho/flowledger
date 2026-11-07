import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../../tests/mocks/server";
import {
  ApiError,
  apiRequest,
  refreshAccessToken,
  registerSessionExpiredHandler,
  tokenStore
} from "../api.client";

const API = "http://localhost:4000";

describe("refreshAccessToken", () => {
  const handler = vi.fn();

  afterEach(() => {
    handler.mockReset();
    tokenStore.clear();
  });

  it("clears the token, notifies the handler and resolves false on 401", async () => {
    registerSessionExpiredHandler(handler);
    tokenStore.set("old");
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })));

    expect(await refreshAccessToken()).toBe(false);
    expect(tokenStore.get()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps the token and skips the handler on a 502", async () => {
    registerSessionExpiredHandler(handler);
    tokenStore.set("old");
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 502 })));

    expect(await refreshAccessToken()).toBe(false);
    expect(tokenStore.get()).toBe("old");
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps the token and skips the handler on a network error", async () => {
    registerSessionExpiredHandler(handler);
    tokenStore.set("old");
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.error()));

    expect(await refreshAccessToken()).toBe(false);
    expect(tokenStore.get()).toBe("old");
    expect(handler).not.toHaveBeenCalled();
  });

  it("stores the new token and resolves true on 200", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.json({ token: "fresh" })));

    expect(await refreshAccessToken()).toBe(true);
    expect(tokenStore.get()).toBe("fresh");
  });
});

describe("apiRequest", () => {
  afterEach(() => tokenStore.clear());

  it("refreshes and retries after a 401 from /auth/password", async () => {
    let calls = 0;
    let refreshes = 0;
    server.use(
      http.patch(`${API}/auth/password`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: "expired" }, { status: 401 })
          : HttpResponse.json({ ok: true });
      }),
      http.post(`${API}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ token: "fresh" });
      })
    );

    expect(await apiRequest("/auth/password", { method: "PATCH", body: {} })).toEqual({ ok: true });
    expect(refreshes).toBe(1);
    expect(calls).toBe(2);
  });

  it("does not refresh after a 401 from /auth/login", async () => {
    let refreshes = 0;
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ message: "Invalid credentials" }, { status: 401 })
      ),
      http.post(`${API}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ token: "fresh" });
      })
    );

    await expect(apiRequest("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials"
    });
    expect(refreshes).toBe(0);
  });

  it("throws an ApiError carrying the response status", async () => {
    server.use(http.get(`${API}/things`, () => HttpResponse.json({ message: "boom" }, { status: 500 })));

    const error = await apiRequest("/things").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
  });
});
