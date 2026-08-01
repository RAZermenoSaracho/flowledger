import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import { archiveGroup, restoreGroup, updateGroup } from "../services/update.service.js";

export async function putGroup(req: Request, res: Response) {
  const groupId = req.params.id;
  if (!groupId) throw notFound("Group");

  const group = await updateGroup(req.user!.id, groupId, req.body);
  res.json({ group: serialize(group) });
}

export async function postGroupArchive(req: Request, res: Response) {
  const groupId = req.params.id;
  if (!groupId) throw notFound("Group");

  const group = await archiveGroup(req.user!.id, groupId);
  res.json({ group: serialize(group) });
}

export async function postGroupRestore(req: Request, res: Response) {
  const groupId = req.params.id;
  if (!groupId) throw notFound("Group");

  const group = await restoreGroup(req.user!.id, groupId);
  res.json({ group: serialize(group) });
}
