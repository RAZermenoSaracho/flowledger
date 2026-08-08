import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getGroupById, listGroups } from "../services/read.service.js";

/** Lists the caller's groups, optionally filtered/sorted per query params. */
export async function getGroups(req: Request, res: Response) {
  const filters = req.query as {
    includeArchived?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
  };
  const groups = await listGroups(req.user!.id, filters);
  res.json({ groups: serialize(groups) });
}

/** Fetches one group with its categories and members, applying the archive/sort/type query params. */
export async function getGroup(req: Request, res: Response) {
  const includeArchivedCategories =
    req.query.includeArchivedCategories === "true";
  const categorySortBy = req.query.categorySortBy as
    | "name"
    | "createdAt"
    | "updatedAt"
    | undefined;
  const categorySortDirection = req.query.categorySortDirection as
    | "asc"
    | "desc"
    | undefined;
  const rawCategoryTypes = req.query.categoryTypes;
  const categoryTypes = Array.isArray(rawCategoryTypes)
    ? (rawCategoryTypes as string[])
    : typeof rawCategoryTypes === "string"
      ? [rawCategoryTypes]
      : undefined;
  const group = await getGroupById(
    req.user!.id,
    req.params.id!,
    includeArchivedCategories,
    { sortBy: categorySortBy, sortDirection: categorySortDirection },
    categoryTypes
  );
  res.json({ group: serialize(group) });
}
