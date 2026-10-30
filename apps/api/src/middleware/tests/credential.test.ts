import type { Request } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import { prismaMock } from "../../tests/helpers/prismaMock.js";
import { hashApiKey } from "../../modules/apiKeys/utils/apiKeys.js";
import { requireCredential, requireScope, verifyCredential } from "../credential.js";

const KEY = "fl_testkey";
const future = new Date(Date.now() + 86_400_000);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    scopes: ["read"],
    expiresAt: future,
    revokedAt: null,
    lastUsedAt: null,
    user: { id: "user-1", email: "u@example.com" },
    ...overrides
  } as never;
}

describe("verifyCredential", () => {
  it("resolves a valid key to its owner and scopes, looking up by hash", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(row());
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });

    await expect(verifyCredential(KEY)).resolves.toEqual({
      userId: "user-1",
      email: "u@example.com",
      scopes: ["read"],
      kind: "apiKey",
      credentialId: "k1"
    });
    expect(prismaMock.apiKey.findUnique.mock.calls[0]![0].where).toEqual({
      secretHash: hashApiKey(KEY)
    });
  });

  it.each([
    ["unknown", null],
    ["revoked", row({ revokedAt: new Date() })],
    ["expired", row({ expiresAt: new Date(Date.now() - 1000) })],
    ["user missing", row({ user: null })]
  ])("rejects a %s key with 401", async (_name, value) => {
    prismaMock.apiKey.findUnique.mockResolvedValue(value as never);

    await expect(verifyCredential(KEY)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("accepts a never-expiring key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(row({ expiresAt: null }));
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });

    await expect(verifyCredential(KEY)).resolves.toMatchObject({ userId: "user-1" });
  });

  it("rejects a web JWT and malformed tokens without touching the DB", async () => {
    const token = jwt.sign({ email: "u@example.com" }, env.JWT_SECRET, { subject: "user-1" });

    await expect(verifyCredential(token)).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyCredential("nope")).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("throttles lastUsedAt via a conditional non-awaited update", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(row());
    prismaMock.apiKey.updateMany.mockReturnValue(new Promise(() => {}) as never);

    await verifyCredential(KEY);

    const args = prismaMock.apiKey.updateMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({ id: "k1" });
    expect(JSON.stringify(args.where)).toContain("lastUsedAt");
  });

  it("does not fail the request when the lastUsedAt write rejects", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(row());
    prismaMock.apiKey.updateMany.mockRejectedValue(new Error("db down"));

    await expect(verifyCredential(KEY)).resolves.toMatchObject({ userId: "user-1" });
  });
});

describe("requireCredential", () => {
  const reqWith = (header?: string) =>
    ({ header: vi.fn().mockReturnValue(header) }) as unknown as Request;

  it("sets req.user and req.credential and calls next()", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(row());
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });
    const req = reqWith(`Bearer ${KEY}`);
    const next = vi.fn();

    await requireCredential(req, {} as never, next);

    expect(req.user).toEqual({ id: "user-1", email: "u@example.com" });
    expect(req.credential?.credentialId).toBe("k1");
    expect(next).toHaveBeenCalledWith();
  });

  it("401s without a Bearer token", async () => {
    const next = vi.fn();
    await requireCredential(reqWith(undefined), {} as never, next);
    expect(next.mock.calls[0]![0]).toMatchObject({ statusCode: 401 });
  });

  it("forwards verification errors", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);
    const next = vi.fn();
    await requireCredential(reqWith(`Bearer ${KEY}`), {} as never, next);
    expect(next.mock.calls[0]![0]).toMatchObject({ statusCode: 401 });
  });
});

describe("requireScope", () => {
  const run = (scope: "read" | "write", scopes: string[]) => {
    const next = vi.fn();
    requireScope(scope)({ credential: { scopes } } as never, {} as never, next);
    return next.mock.calls[0]![0];
  };

  it("403s a read key on a write route", () => {
    expect(run("write", ["read"])).toMatchObject({ statusCode: 403 });
  });

  it("allows write on write routes and write implies read", () => {
    expect(run("write", ["read", "write"])).toBeUndefined();
    expect(run("read", ["write"])).toBeUndefined();
    expect(run("read", ["read"])).toBeUndefined();
  });

  it("403s when there is no credential", () => {
    const next = vi.fn();
    requireScope("read")({} as never, {} as never, next);
    expect(next.mock.calls[0]![0]).toMatchObject({ statusCode: 403 });
  });
});

describe("verifyCredential (OAuth access tokens)", () => {
  const TOKEN = "flo_testtoken";
  const grant = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "g1",
      scopes: ["read", "write"],
      lastUsedAt: null,
      user: { id: "user-1", email: "u@example.com" },
      ...overrides
    }) as never;

  it("resolves a live grant by access-token hash, re-checking revocation and expiry in the query", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(grant());
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    await expect(verifyCredential(TOKEN)).resolves.toEqual({
      userId: "user-1",
      email: "u@example.com",
      scopes: ["read", "write"],
      kind: "oauth",
      credentialId: "g1"
    });

    const where = prismaMock.oAuthGrant.findFirst.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ accessTokenHash: hashApiKey(TOKEN), revokedAt: null });
    expect(JSON.stringify(where)).toContain("accessExpiresAt");
    expect(JSON.stringify(where)).toContain("expiresAt");
  });

  it("rejects an unknown, revoked or expired token (no row) and a grant whose user is gone", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(null);
    await expect(verifyCredential(TOKEN)).rejects.toMatchObject({ statusCode: 401 });
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(grant({ user: null }));
    await expect(verifyCredential(TOKEN)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects refresh tokens and honours the kinds option in both directions", async () => {
    await expect(verifyCredential("flr_refresh")).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyCredential(TOKEN, ["apiKey"])).rejects.toMatchObject({ statusCode: 401 });
    await expect(verifyCredential(KEY, ["oauth"])).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.oAuthGrant.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("throttles lastUsedAt without awaiting it", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(grant());
    prismaMock.oAuthGrant.updateMany.mockReturnValue(new Promise(() => {}) as never);

    await verifyCredential(TOKEN);

    expect(JSON.stringify(prismaMock.oAuthGrant.updateMany.mock.calls[0]![0].where)).toContain(
      "lastUsedAt"
    );
  });
});

describe("requireCredential (API-key-only routes)", () => {
  it("rejects an OAuth access token", async () => {
    const next = vi.fn();
    await requireCredential({ header: () => "Bearer flo_x" } as unknown as Request, {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(prismaMock.oAuthGrant.findFirst).not.toHaveBeenCalled();
  });
});
