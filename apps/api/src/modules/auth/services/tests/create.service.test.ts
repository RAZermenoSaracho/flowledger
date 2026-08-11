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

    const result = await issueRefreshToken("user-1");

    expect(result.token).toHaveLength(64);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" })
      })
    );
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
        data: expect.objectContaining({ passwordHash: "hashed-password" })
      })
    );
    expect(result.user).toMatchObject({ id: "user-1" });
    expect(typeof result.token).toBe("string");
    expect(result.refreshToken.token).toHaveLength(64);
  });
});
