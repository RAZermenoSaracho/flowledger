import type { UpdateUserPasswordInput, UpdateUserPlanInput, UpdateUserProfileInput, UserSearchQuery } from "@flowledger/shared";
import {
  updateUserPasswordSchema,
  updateUserPlanSchema,
  updateUserProfileSchema,
  userSearchQuerySchema
} from "@flowledger/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";
import { readMultipartParts } from "../../utils/multipart.js";
import { publicUser } from "../../utils/serialize.js";

export const usersRouter = Router();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const avatarUploadDir = path.resolve(moduleDir, "../../../uploads/avatars");
const maxAvatarBytes = 2 * 1024 * 1024;
const avatarContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

usersRouter.get(
  "/search",
  validate(userSearchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as UserSearchQuery;
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user!.id },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: limit
    });

    res.json({ users });
  })
);

usersRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ user: publicUser(user) });
  })
);

usersRouter.patch(
  "/me",
  validate(updateUserProfileSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as UpdateUserProfileInput;
    const emailOwner = await prisma.user.findUnique({ where: { email: input.email } });

    if (emailOwner && emailOwner.id !== req.user!.id) {
      throw new HttpError(409, "Email is already registered");
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name: input.name,
        email: input.email
      }
    });

    res.json({ user: publicUser(user) });
  })
);

usersRouter.post(
  "/me/avatar",
  asyncHandler(async (req, res) => {
    if (!req.is("multipart/form-data")) {
      throw new HttpError(415, "Avatar upload must use multipart/form-data");
    }

    const parts = await readMultipartParts(req, maxAvatarBytes + 1024 * 16);
    const avatar = parts.find((part) => part.fieldName === "avatar");

    if (!avatar || !avatar.filename) {
      throw new HttpError(400, "Avatar image file is required");
    }

    if (!avatar.contentType || !avatarContentTypes.has(avatar.contentType)) {
      throw new HttpError(400, "Avatar must be a JPG, PNG, WebP, or GIF image");
    }

    if (avatar.data.length === 0 || avatar.data.length > maxAvatarBytes) {
      throw new HttpError(400, "Avatar must be between 1 byte and 2 MB");
    }

    const extension = imageExtension(avatar.data, avatar.contentType);
    if (!extension) {
      throw new HttpError(400, "Avatar file content is not a supported image");
    }

    await mkdir(avatarUploadDir, { recursive: true });

    const filename = `${req.user!.id}-${Date.now()}.${extension}`;
    await writeFile(path.join(avatarUploadDir, filename), avatar.data, { flag: "wx" });

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: `/uploads/avatars/${filename}` }
    });

    res.json({ user: publicUser(user) });
  })
);

usersRouter.patch(
  "/me/password",
  validate(updateUserPasswordSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as UpdateUserPasswordInput;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const isCurrentPasswordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!isCurrentPasswordValid) {
      throw new HttpError(401, "Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash }
    });

    res.status(204).send();
  })
);

usersRouter.patch(
  "/me/plan",
  validate(updateUserPlanSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as UpdateUserPlanInput;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { planType: input.planType }
    });

    res.json({ user: publicUser(user) });
  })
);

function imageExtension(data: Buffer, contentType: string) {
  if (contentType === "image/png" && data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return "png";
  }

  if (contentType === "image/jpeg" && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "jpg";
  }

  if (
    contentType === "image/gif" &&
    (data.subarray(0, 6).toString("ascii") === "GIF87a" || data.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "gif";
  }

  if (
    contentType === "image/webp" &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}
