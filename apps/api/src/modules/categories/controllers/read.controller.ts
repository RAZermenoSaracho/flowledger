import type { Request, Response } from "express";
import { listCategories } from "../services/read.service.js";

/** Lists categories visible to the authenticated user for the given scope, per a DSQL query. */
export async function getCategories(req: Request, res: Response) {
  const { groupId, scope } = req.query as { groupId?: string; scope?: "all" };
  const categories = await listCategories(
    req.user!.id,
    { groupId, scope },
    req.query.query as string | undefined
  );
  res.json({ categories });
}
