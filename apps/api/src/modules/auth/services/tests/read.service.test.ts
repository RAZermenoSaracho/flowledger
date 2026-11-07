import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() }
}));

vi.mock("../create.service.js", () => ({
  issueRefreshToken: vi.fn()
}));

const { issueRefreshToken } = await import("../create.service.js");
const issueRefreshTokenMock = vi.mocked(issueRefreshToken);

const { authenticateUser, getCurrentUser, getValidRefreshToken } = await import(
  "../read.service.js"
);

describe("authenticateUser", () => {
  it("throws a 401 when no user matches the email", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      authenticateUser({ email: "missing@example.com", password: "x", keepLoggedIn: true })
    ).rejects.toThrow("Invalid email or password");
  });

  it("throws a 401 for a Google-only account (no passwordHash)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: null
    } as never);

    await expect(
      authenticateUser({ email: "ada@example.com", password: "x", keepLoggedIn: true })
    ).rejects.toThrow("Invalid email or password");
  });

  it.each([
    ["an unknown email", null],
    ["a password-less account", { id: "user-1", passwordHash: null }],
    ["a wrong password", { id: "user-1", passwordHash: "stored-hash" }]
  ])("runs exactly one hash comparison and the same 401 for %s", async (_label, user) => {
    vi.mocked(bcrypt.compare).mockClear();
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    prismaMock.user.findUnique.mockResolvedValue(user as never);

    await expect(
      authenticateUser({ email: "ada@example.com", password: "x", keepLoggedIn: true })
    ).rejects.toMatchObject({ statusCode: 401, message: "Invalid email or password" });
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it("does not accept a password matching the dummy hash on a password-less account", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", passwordHash: null } as never);

    await expect(
      authenticateUser({ email: "ada@example.com", password: "x", keepLoggedIn: true })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws a 401 when the password doesn't match", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      authenticateUser({ email: "ada@example.com", password: "wrong", keepLoggedIn: true })
    ).rejects.toThrow("Invalid email or password");
  });

  it("returns a token pair for a valid email/password", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    issueRefreshTokenMock.mockResolvedValue({
      token: "refresh-token",
      expiresAt: new Date(),
      persistent: true
    });

    const result = await authenticateUser({
      email: "ada@example.com",
      password: "correct",
      keepLoggedIn: true
    });

    expect(result.user).toMatchObject({ id: "user-1" });
    expect(result.refreshToken.token).toBe("refresh-token");
    expect(typeof result.token).toBe("string");
  });

  it.each([true, false])("passes keepLoggedIn=%s through to issueRefreshToken", async (keepLoggedIn) => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    issueRefreshTokenMock.mockResolvedValue({
      token: "refresh-token",
      expiresAt: new Date(),
      persistent: keepLoggedIn
    });

    await authenticateUser({ email: "ada@example.com", password: "correct", keepLoggedIn });

    expect(issueRefreshTokenMock).toHaveBeenCalledWith("user-1", keepLoggedIn);
  });
});

describe("getCurrentUser", () => {
  it("returns the user by id", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1"
    } as never);

    expect(await getCurrentUser("user-1")).toMatchObject({ id: "user-1" });
  });
});

describe("getValidRefreshToken replay handling", () => {
  function revokedRecord(revokedMsAgo: number) {
    return {
      id: "rt-old",
      userId: "user-1",
      revokedAt: new Date(Date.now() - revokedMsAgo),
      expiresAt: new Date(Date.now() + 60_000)
    };
  }

  it("rejects without revoking descendants inside the grace period", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(revokedRecord(30_000) as never);
    prismaMock.refreshToken.findMany.mockClear();

    await expect(getValidRefreshToken("plaintext")).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it("revokes every descendant, including siblings, after the grace period", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(revokedRecord(120_000) as never);
    prismaMock.refreshToken.findMany
      .mockReset()
      .mockResolvedValueOnce([{ id: "child-1" }, { id: "child-2" }] as never)
      .mockResolvedValueOnce([{ id: "grandchild" }] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.refreshToken.updateMany.mockReset();

    await expect(getValidRefreshToken("plaintext")).rejects.toMatchObject({ statusCode: 401 });

    expect(prismaMock.refreshToken.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: "user-1", previousTokenId: { in: ["rt-old"] } },
      select: { id: true }
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["child-1", "child-2"] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["grandchild"] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });
});

describe("getValidRefreshToken", () => {
  it("throws a 401 when no token record matches", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    await expect(getValidRefreshToken("plaintext")).rejects.toThrow(
      "Invalid or expired refresh token"
    );
  });

  it("throws a 401 when the token was revoked", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000)
    } as never);

    await expect(getValidRefreshToken("plaintext")).rejects.toThrow(
      "Invalid or expired refresh token"
    );
  });

  it("throws a 401 when the token is expired", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60_000)
    } as never);

    await expect(getValidRefreshToken("plaintext")).rejects.toThrow(
      "Invalid or expired refresh token"
    );
  });

  it("returns the record for a live, unrevoked token", async () => {
    const record = {
      id: "rt-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000)
    };
    prismaMock.refreshToken.findUnique.mockResolvedValue(record as never);

    expect(await getValidRefreshToken("plaintext")).toMatchObject({
      id: "rt-1"
    });
  });
});
