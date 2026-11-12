import { Prisma } from "@prisma/client";
import { usernameSchema } from "@flowledger/shared";
import { describe, expect, it, vi } from "vitest";
import { generateUsername, isUsernameConflict, withGeneratedUsername } from "../generateUsername.js";

const conflict = (target: unknown) =>
  new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target } });

describe("generateUsername", () => {
  it("produces a valid shared-schema username with no fixed content beyond the prefix", () => {
    const values = new Set(Array.from({ length: 50 }, generateUsername));
    expect(values.size).toBe(50);
    for (const value of values) {
      expect(value).toMatch(/^user_[a-z0-9]{12}$/);
      expect(usernameSchema.safeParse(value).success).toBe(true);
    }
  });
});

describe("isUsernameConflict", () => {
  it("matches only a P2002 on username", () => {
    expect(isUsernameConflict(conflict(["username"]))).toBe(true);
    expect(isUsernameConflict(conflict("User_username_key"))).toBe(true);
    expect(isUsernameConflict(conflict(["email"]))).toBe(false);
    expect(isUsernameConflict(new Error("x"))).toBe(false);
  });
});

describe("withGeneratedUsername", () => {
  it("retries on a username collision and returns the eventual result", async () => {
    const create = vi.fn().mockRejectedValueOnce(conflict(["username"])).mockResolvedValue("ok");
    await expect(withGeneratedUsername(create)).resolves.toBe("ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("rethrows other errors immediately", async () => {
    const create = vi.fn().mockRejectedValue(conflict(["email"]));
    await expect(withGeneratedUsername(create)).rejects.toThrow("dup");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives up after repeated collisions", async () => {
    const create = vi.fn().mockRejectedValue(conflict(["username"]));
    await expect(withGeneratedUsername(create)).rejects.toThrow("dup");
    expect(create).toHaveBeenCalledTimes(5);
  });
});
