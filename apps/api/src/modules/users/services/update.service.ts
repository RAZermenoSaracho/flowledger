import type {
  UpdateUserPasswordInput,
  UpdateUserPlanInput,
  UpdateUserProfileInput,
  UpdateUserSidebarSideInput
} from "@flowledger/shared";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { imageExtension } from "../utils/imageExtension.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const avatarUploadDir = path.resolve(moduleDir, "../../../../uploads/avatars");
export const maxAvatarBytes = 2 * 1024 * 1024;
const avatarContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

export async function updateProfile(
  userId: string,
  input: UpdateUserProfileInput
) {
  const emailOwner = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (emailOwner && emailOwner.id !== userId) {
    throw new HttpError(409, "Email is already registered");
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      email: input.email,
      ...(input.preferredCurrency !== undefined
        ? { preferredCurrency: input.preferredCurrency }
        : {})
    }
  });
}

export async function uploadAvatar(
  userId: string,
  avatar: { filename?: string; contentType?: string; data: Buffer }
) {
  if (!avatar.filename) {
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

  const filename = `${userId}-${Date.now()}.${extension}`;
  await writeFile(path.join(avatarUploadDir, filename), avatar.data, {
    flag: "wx"
  });

  return prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: `/uploads/avatars/${filename}` }
  });
}

export async function updatePassword(
  userId: string,
  input: UpdateUserPasswordInput
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isCurrentPasswordValid = user.passwordHash
    ? await bcrypt.compare(input.currentPassword, user.passwordHash)
    : false;

  if (!isCurrentPasswordValid) {
    throw new HttpError(401, "Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });
}

export async function updatePlan(userId: string, input: UpdateUserPlanInput) {
  return prisma.user.update({
    where: { id: userId },
    data: { planType: input.planType }
  });
}

export async function updateSidebarSide(
  userId: string,
  input: UpdateUserSidebarSideInput
) {
  return prisma.user.update({
    where: { id: userId },
    data: { mobileSidebarSide: input.mobileSidebarSide }
  });
}
