import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn() }
}));

const { issueRefreshToken, registerUser } = await import("../create.service.js");

describe("issueRefreshToken", () => {
  it("persists a new refresh token and returns its plaintext value and expiry", async () => {
    prismaMock.refreshToken.create.mockResolvedValue({} as never);

    const result = await issueRefreshToken("user-1", true);

    expect(result.token).toHaveLength(64);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.persistent).toBe(true);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" })
      })
    );
  });

  it("stores persistent and previousTokenId on the row", async () => {
    prismaMock.refreshToken.create.mockResolvedValue({} as never);

    const result = await issueRefreshToken("user-1", false, "rt-prev");

    expect(result.persistent).toBe(false);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        persistent: false,
        previousTokenId: "rt-prev"
      })
    });
  });

  it("leaves previousTokenId undefined for a first-generation token", async () => {
    prismaMock.refreshToken.create.mockResolvedValue({} as never);

    await issueRefreshToken("user-1", true);

    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ persistent: true, previousTokenId: undefined })
    });
  });
});

describe("issueRefreshToken cleanup", () => {
  it("deletes only the user's expired tokens", async () => {
    prismaMock.refreshToken.create.mockResolvedValue({} as never);
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 } as never);

    await issueRefreshToken("user-1", true);

    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", expiresAt: { lt: expect.any(Date) } }
    });
  });

  it("still returns the token when the delete fails", async () => {
    prismaMock.refreshToken.create.mockResolvedValue({} as never);
    prismaMock.refreshToken.deleteMany.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(issueRefreshToken("user-1", true)).resolves.toMatchObject({ persistent: true });
  });
});

describe("registerUser username collisions", () => {
  it("retries with a new username on a username unique violation", async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue("h" as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["username"] } })
      )
      .mockResolvedValueOnce({ id: "user-1", email: "a@example.com" } as never);
    prismaMock.refreshToken.create.mockResolvedValue({} as never);

    await registerUser({ name: "A", email: "a@example.com", password: "longenough" });

    expect(prismaMock.user.create).toHaveBeenCalledTimes(2);
  });
});

describe("registerUser", () => {
  it("throws a 409 when the email is already registered", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" } as never);

    await expect(
      registerUser({ name: "Ada", email: "ada@example.com", password: "longenough" })
    ).rejects.toThrow("Email is already registered");
  });

  it("creates the user with a hashed password and issues a token pair", async () => {
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed-password" as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com"
    } as never);
    prismaMock.refreshToken.create.mockResolvedValue({} as never);

    const result = await registerUser({
      name: "Ada",
      email: "ada@example.com",
      password: "longenough"
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("longenough", 12);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "hashed-password",
          username: expect.stringMatching(/^user_[a-z0-9]{12}$/)
        })
      })
    );
    expect(result.user).toMatchObject({ id: "user-1" });
    expect(typeof result.token).toBe("string");
    expect(result.refreshToken.token).toHaveLength(64);
  });
});
