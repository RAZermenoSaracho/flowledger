import { categorySchema, updateCategorySchema } from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";

export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    });
    res.json({ categories });
  })
);

categoriesRouter.post(
  "/",
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.create({ data: { ...req.body, userId: req.user!.id } });
    res.status(201).json({ category });
  })
);

categoriesRouter.put(
  "/:id",
  validate(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw notFound("Category");

    const category = await prisma.category.update({ where: { id: existing.id }, data: req.body });
    res.json({ category });
  })
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw notFound("Category");

    await prisma.category.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
