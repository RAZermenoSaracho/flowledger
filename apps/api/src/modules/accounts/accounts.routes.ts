import { accountSchema, updateAccountSchema } from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";

export const accountsRouter = Router();

accountsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user!.id },
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

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw notFound("Account");

    await prisma.account.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
