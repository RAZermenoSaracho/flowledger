import type { Request, Response } from "express";
import { listCategories } from "../services/read.service.js";

export async function getCategories(req: Request, res: Response) {
  const filters = req.query as {
    groupId?: string;
    scope?: "all";
    includeArchived?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
    types?: string[];
  };
  const categories = await listCategories(req.user!.id, filters);
  res.json({ categories });
}
