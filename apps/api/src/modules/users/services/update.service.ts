import type {
  UpdateUserEmailInput,
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
import { hashRefreshToken } from "../../auth/utils/tokens.js";
import { imageExtension } from "../utils/imageExtension.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const avatarUploadDir = path.resolve(moduleDir, "../../../../uploads/avatars");
/** Maximum accepted avatar upload size, in bytes. */
export const maxAvatarBytes = 2 * 1024 * 1024;
const avatarContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

/** Updates a user's name and preferred currency. Rejects a differing email, which only {@link updateEmail} can change. */
export async function updateProfile(
  userId: string,
  input: UpdateUserProfileInput
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (input.email !== user.email) {
    throw new HttpError(400, "Email can only be changed with your current password");
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      ...(input.preferredCurrency !== undefined
        ? { preferredCurrency: input.preferredCurrency }
        : {})
    }
  });
}

/** Validates and writes an uploaded avatar image to disk, then points the user's `avatarUrl` at it. */
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

/**
 * Changes the login email after re-checking the current password, and in the same transaction revokes every refresh token except this device's (or all of them, with no cookie).
 *
 * @throws 400 for a wrong password or an account with no password, 409 if another account has the email in any letter case.
 */
export async function updateEmail(
  userId: string,
  input: UpdateUserEmailInput,
  currentRefreshToken?: string
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.passwordHash) {
    throw new HttpError(400, "This account has no password, so its email can't be changed");
  }

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect");
  }

  const emailOwner = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" }, id: { not: userId } },
    select: { id: true }
  });

  if (emailOwner) {
    throw new HttpError(409, "Email is already registered");
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { email: input.email } }),
    prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentRefreshToken
          ? { tokenHash: { not: hashRefreshToken(currentRefreshToken) } }
          : {})
      },
      data: { revokedAt: new Date() }
    })
  ]);

  return updatedUser;
}

/** Changes a user's password after verifying `input.currentPassword` (400 on mismatch), and atomically revokes every refresh token except `currentRefreshToken`, or all of them if it is absent. */
export async function updatePassword(
  userId: string,
  input: UpdateUserPasswordInput,
  currentRefreshToken?: string
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isCurrentPasswordValid = user.passwordHash
    ? await bcrypt.compare(input.currentPassword, user.passwordHash)
    : false;

  if (!isCurrentPasswordValid) {
    throw new HttpError(400, "Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentRefreshToken
          ? { tokenHash: { not: hashRefreshToken(currentRefreshToken) } }
          : {})
      },
      data: { revokedAt: new Date() }
    })
  ]);
}

/** Updates a user's plan tier. */
export async function updatePlan(userId: string, input: UpdateUserPlanInput) {
  return prisma.user.update({
    where: { id: userId },
    data: { planType: input.planType }
  });
}

/** Updates which side of the screen a user's mobile sidebar opens from. */
export async function updateSidebarSide(
  userId: string,
  input: UpdateUserSidebarSideInput
) {
  return prisma.user.update({
    where: { id: userId },
    data: { mobileSidebarSide: input.mobileSidebarSide }
  });
}
