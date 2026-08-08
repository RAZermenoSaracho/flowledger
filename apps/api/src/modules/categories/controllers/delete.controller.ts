import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { deleteCategory } from "../services/delete.service.js";

/** Deletes a category the authenticated user is allowed to edit. */
export async function deleteCategoryController(req: Request, res: Response) {
  const categoryId = req.params.id;
  if (!categoryId) throw notFound("Category");

  await deleteCategory(req.user!.id, categoryId);
  res.status(204).send();
}
