import {
  categoryFiltersSchema,
  categorySchema,
  updateCategorySchema
} from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { getGroupMembership } from "../groups/groups.service.js";

export const categoriesRouter = Router();

async function getEditableCategory(userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, users: { some: { userId } } }
  });
  if (!category) throw notFound("Category");
  return category;
}

categoriesRouter.get(
  "/",
  validate(categoryFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as { groupId?: string };

    if (filters.groupId) {
      await getGroupMembership(req.user!.id, filters.groupId);
    }

    const categories = await prisma.category.findMany({
      where: filters.groupId
        ? {
            groupId: filters.groupId,
            users: { some: { userId: req.user!.id } }
          }
        : { groupId: null, users: { some: { userId: req.user!.id } } },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    });
    res.json({ categories });
  })
);

categoriesRouter.post(
  "/",
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.create({
      data: {
        ...req.body,
        groupId: null,
        users: { create: { userId: req.user!.id } }
      }
    });
    res.status(201).json({ category });
  })
);

categoriesRouter.put(
  "/:id",
  validate(updateCategorySchema),
  asyncHandler(async (req, res) => {
    const categoryId = req.params.id;
    if (!categoryId) throw notFound("Category");

    const existing = await getEditableCategory(req.user!.id, categoryId);

    const category = await prisma.category.update({
      where: { id: existing.id },
      data: req.body
    });
    res.json({ category });
  })
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const categoryId = req.params.id;
    if (!categoryId) throw notFound("Category");

    const existing = await getEditableCategory(req.user!.id, categoryId);

    await prisma.category.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
