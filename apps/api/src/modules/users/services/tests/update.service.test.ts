import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() }
}));

const bcrypt = (await import("bcryptjs")).default;
const { HttpError } = await import("../../../../utils/httpError.js");
const { hashRefreshToken } = await import("../../../auth/utils/tokens.js");
const { mkdir, writeFile } = await import("node:fs/promises");

const {
  maxAvatarBytes,
  updateEmail,
  updatePassword,
  updatePlan,
  updateProfile,
  updateSidebarSide,
  uploadAvatar
} = await import("../update.service.js");

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

describe("updateProfile", () => {
  it("rejects a differing email without changing anything", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ email: "mine@example.com" } as never);
    prismaMock.user.update.mockClear();

    await expect(
      updateProfile("user-1", { name: "Ada", email: "new@example.com" })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("saves other fields when the email is unchanged, and never writes email", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ email: "mine@example.com" } as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    await updateProfile("user-1", { name: "Ada", email: "mine@example.com" });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Ada" }
    });
  });

  it("includes preferredCurrency when provided", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ email: "mine@example.com" } as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    await updateProfile("user-1", {
      name: "Ada",
      email: "mine@example.com",
      preferredCurrency: "USD"
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Ada", preferredCurrency: "USD" } })
    );
  });
});

describe("updateEmail", () => {
  const input = { email: "new@example.com", currentPassword: "pw" };

  function user(passwordHash: string | null = "stored-hash") {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", passwordHash } as never);
    prismaMock.user.update.mockClear();
    prismaMock.refreshToken.updateMany.mockClear();
    prismaMock.$transaction.mockClear();
  }

  function expectNothingChanged() {
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  }

  it("rejects a password-less account with a 400", async () => {
    user(null);

    await expect(updateEmail("user-1", input)).rejects.toMatchObject({ statusCode: 400 });
    expectNothingChanged();
  });

  it("rejects a wrong password with a 400", async () => {
    user();
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(updateEmail("user-1", input)).rejects.toThrow("Current password is incorrect");
    expectNothingChanged();
  });

  it("returns a 409 when another account has the email in any letter case", async () => {
    user();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.user.findFirst.mockResolvedValue({ id: "other" } as never);

    await expect(updateEmail("user-1", input)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: "new@example.com", mode: "insensitive" },
          id: { not: "user-1" }
        }
      })
    );
    expectNothingChanged();
  });

  it("updates the email and revokes other sessions in one transaction, keeping this device", async () => {
    user();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockResolvedValue([{ id: "user-1", email: input.email }, { count: 2 }] as never);

    const updated = await updateEmail("user-1", input, "this-device-token");

    expect(updated).toEqual({ id: "user-1", email: input.email });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: input.email }
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
        tokenHash: { not: expect.any(String) }
      },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it("returns a 409 when a concurrent change takes the email first", async () => {
    user();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" })
    );

    await expect(updateEmail("user-1", input)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("revokes every session when no refresh cookie identifies this device", async () => {
    user();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockResolvedValue([{ id: "user-1" }, { count: 2 }] as never);

    await updateEmail("user-1", input);

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });
});

describe("uploadAvatar", () => {
  it("throws a 400 when no filename is given", async () => {
    await expect(
      uploadAvatar("user-1", { data: pngBytes })
    ).rejects.toThrow("Avatar image file is required");
  });

  it("throws a 400 for an unsupported content type", async () => {
    await expect(
      uploadAvatar("user-1", { filename: "a.bmp", contentType: "image/bmp", data: pngBytes })
    ).rejects.toThrow("Avatar must be a JPG, PNG, WebP, or GIF image");
  });

  it("throws a 400 for an empty file", async () => {
    await expect(
      uploadAvatar("user-1", { filename: "a.png", contentType: "image/png", data: Buffer.alloc(0) })
    ).rejects.toThrow("Avatar must be between 1 byte and 2 MB");
  });

  it("throws a 400 for a file over the max size", async () => {
    await expect(
      uploadAvatar("user-1", {
        filename: "a.png",
        contentType: "image/png",
        data: Buffer.alloc(maxAvatarBytes + 1)
      })
    ).rejects.toThrow("Avatar must be between 1 byte and 2 MB");
  });

  it("throws a 400 when the file content doesn't match the claimed type", async () => {
    await expect(
      uploadAvatar("user-1", {
        filename: "a.png",
        contentType: "image/png",
        data: Buffer.from("not a real png")
      })
    ).rejects.toThrow("Avatar file content is not a supported image");
  });

  it("writes the file and updates avatarUrl on success", async () => {
    prismaMock.user.update.mockResolvedValue({
      avatarUrl: "/uploads/avatars/x.png"
    } as never);

    const result = await uploadAvatar("user-1", {
      filename: "a.png",
      contentType: "image/png",
      data: pngBytes
    });

    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avatarUrl: expect.stringMatching(/^\/uploads\/avatars\/user-1-\d+\.png$/)
        })
      })
    );
    expect(result.avatarUrl).toBe("/uploads/avatars/x.png");
  });
});

describe("updatePassword", () => {
  const input = {
    currentPassword: "correct",
    newPassword: "newpassword",
    confirmPassword: "newpassword"
  };

  it("throws a 400 HttpError when the current password is wrong and touches neither password nor tokens", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const error = await updatePassword("user-1", { ...input, currentPassword: "wrong" }).catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 400, message: "Current password is incorrect" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("throws a 400 for a Google-only account with no password set", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: null
    } as never);

    await expect(updatePassword("user-1", input)).rejects.toMatchObject({ statusCode: 400 });
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("stores the new hash and revokes every other live token in one transaction", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("new-hash" as never);

    await updatePassword("user-1", input, "current-plaintext");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "new-hash" }
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
        tokenHash: { not: hashRefreshToken("current-plaintext") }
      },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prismaMock.$transaction).mock.calls[0]![0]).toHaveLength(2);
  });

  it("revokes all of the user's live tokens when there is no current token", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("new-hash" as never);

    await updatePassword("user-1", input);

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });
});

describe("updatePlan", () => {
  it("updates the user's plan type", async () => {
    prismaMock.user.update.mockResolvedValue({} as never);

    await updatePlan("user-1", { planType: "flowledger_one" });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planType: "flowledger_one" }
    });
  });
});

describe("updateSidebarSide", () => {
  it("updates the mobile sidebar side", async () => {
    prismaMock.user.update.mockResolvedValue({} as never);

    await updateSidebarSide("user-1", { mobileSidebarSide: "right" });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { mobileSidebarSide: "right" }
    });
  });
});
