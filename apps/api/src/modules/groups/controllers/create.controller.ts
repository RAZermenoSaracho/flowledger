import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import { addGroupCategory, addGroupMember, createGroup } from "../services/create.service.js";

export async function postGroup(req: Request, res: Response) {
  const group = await createGroup(req.user!.id, req.body);
  res.status(201).json({ group: serialize(group) });
}

export async function postGroupMember(req: Request, res: Response) {
  const groupId = req.params.id;
  if (!groupId) throw notFound("Group");

  const member = await addGroupMember(req.user!.id, groupId, req.body.userId);
  res.status(201).json({ member: serialize(member) });
}

export async function postGroupCategory(req: Request, res: Response) {
  const groupId = req.params.id;
  if (!groupId) throw notFound("Group");

  const category = await addGroupCategory(req.user!.id, groupId, req.body);
  res.status(201).json({ category: serialize(category) });
}
