import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getGroupById, listGroups } from "../services/read.service.js";

/** Lists the caller's groups per a DSQL query. */
export async function getGroups(req: Request, res: Response) {
  const groups = await listGroups(
    req.user!.id,
    req.query.query as string | undefined
  );
  res.json({ groups: serialize(groups) });
}

/** Fetches one group with its active categories and members. */
export async function getGroup(req: Request, res: Response) {
  const group = await getGroupById(req.user!.id, req.params.id!);
  res.json({ group: serialize(group) });
}
