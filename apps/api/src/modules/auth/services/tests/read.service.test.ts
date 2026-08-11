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
      authenticateUser({ email: "missing@example.com", password: "x" })
    ).rejects.toThrow("Invalid email or password");
  });

  it("throws a 401 for a Google-only account (no passwordHash)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: null
    } as never);

    await expect(
      authenticateUser({ email: "ada@example.com", password: "x" })
    ).rejects.toThrow("Invalid email or password");
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("throws a 401 when the password doesn't match", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      authenticateUser({ email: "ada@example.com", password: "wrong" })
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
      expiresAt: new Date()
    });

    const result = await authenticateUser({
      email: "ada@example.com",
      password: "correct"
    });

    expect(result.user).toMatchObject({ id: "user-1" });
    expect(result.refreshToken.token).toBe("refresh-token");
    expect(typeof result.token).toBe("string");
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
