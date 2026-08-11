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
const { mkdir, writeFile } = await import("node:fs/promises");

const {
  maxAvatarBytes,
  updatePassword,
  updatePlan,
  updateProfile,
  updateSidebarSide,
  uploadAvatar
} = await import("../update.service.js");

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

describe("updateProfile", () => {
  it("throws a 409 when the new email belongs to a different user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "other-user" } as never);

    await expect(
      updateProfile("user-1", { name: "Ada", email: "taken@example.com" })
    ).rejects.toThrow("Email is already registered");
  });

  it("allows keeping your own email", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" } as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    await updateProfile("user-1", { name: "Ada", email: "mine@example.com" });

    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it("omits preferredCurrency from the update when not provided", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({} as never);

    await updateProfile("user-1", { name: "Ada", email: "new@example.com" });

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ preferredCurrency: expect.anything() })
      })
    );
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
  it("throws a 401 when the current password is wrong", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      updatePassword("user-1", {
        currentPassword: "wrong",
        newPassword: "newpassword",
        confirmPassword: "newpassword"
      })
    ).rejects.toThrow("Current password is incorrect");
  });

  it("throws a 401 for a Google-only account with no password set", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: null
    } as never);

    await expect(
      updatePassword("user-1", {
        currentPassword: "x",
        newPassword: "newpassword",
        confirmPassword: "newpassword"
      })
    ).rejects.toThrow("Current password is incorrect");
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("hashes and stores the new password when the current one is correct", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      passwordHash: "hash"
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("new-hash" as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    await updatePassword("user-1", {
      currentPassword: "correct",
      newPassword: "newpassword",
      confirmPassword: "newpassword"
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { passwordHash: "new-hash" } })
    );
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
