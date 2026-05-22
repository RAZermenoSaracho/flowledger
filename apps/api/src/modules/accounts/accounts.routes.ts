import {
  accountFiltersSchema,
  accountSchema,
  updateAccountSchema
} from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";

export const accountsRouter = Router();

accountsRouter.get(
  "/",
  validate(accountFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as { includeArchived?: string };
    const accounts = await prisma.account.findMany({
      where: {
        userId: req.user!.id,
        ...(filters.includeArchived === "true" ? {} : { isArchived: false })
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ accounts });
  })
);

accountsRouter.post(
  "/",
  validate(accountSchema),
  asyncHandler(async (req, res) => {
    const account = await prisma.account.create({
      data: { ...req.body, userId: req.user!.id }
    });
    res.status(201).json({ account });
  })
);

accountsRouter.put(
  "/:id",
  validate(updateAccountSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw notFound("Account");

    const account = await prisma.account.update({ where: { id: existing.id }, data: req.body });
    res.json({ account });
  })
);

accountsRouter.post(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Account");

    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { isArchived: true, archivedAt: new Date() }
    });
    res.json({ account });
  })
);

accountsRouter.post(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Account");

    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { isArchived: false, archivedAt: null }
    });
    res.json({ account });
  })
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw notFound("Account");

    await prisma.account.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
