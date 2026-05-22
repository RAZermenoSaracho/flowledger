import type { UpdateUserPasswordInput, UpdateUserPlanInput, UpdateUserProfileInput, UserSearchQuery } from "@flowledger/shared";
import {
  updateUserPasswordSchema,
  updateUserPlanSchema,
  updateUserProfileSchema,
  userSearchQuerySchema
} from "@flowledger/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";
import { publicUser } from "../../utils/serialize.js";

export const usersRouter = Router();

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
        email: input.email,
        avatarUrl: input.avatarUrl ?? null
      }
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
