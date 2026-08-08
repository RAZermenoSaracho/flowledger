import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { archiveCategory, restoreCategory, updateCategory } from "../services/update.service.js";

/** Updates a category's editable fields (name/type/color). */
export async function putCategory(req: Request, res: Response) {
  const categoryId = req.params.id;
  if (!categoryId) throw notFound("Category");

  const category = await updateCategory(req.user!.id, categoryId, req.body);
  res.json({ category });
}

/** Marks a category archived. */
export async function postCategoryArchive(req: Request, res: Response) {
  const categoryId = req.params.id;
  if (!categoryId) throw notFound("Category");

  const category = await archiveCategory(req.user!.id, categoryId);
  res.json({ category });
}

/** Un-archives a category. */
export async function postCategoryRestore(req: Request, res: Response) {
  const categoryId = req.params.id;
  if (!categoryId) throw notFound("Category");

  const category = await restoreCategory(req.user!.id, categoryId);
  res.json({ category });
}
