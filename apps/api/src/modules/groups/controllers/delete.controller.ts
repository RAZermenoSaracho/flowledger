import type { Request, Response } from "express";
import { notFound } from "../../../utils/httpError.js";
import { deleteGroup, removeGroupMember } from "../services/delete.service.js";

/** Deletes a group the caller administers. */
export async function deleteGroupController(req: Request, res: Response) {
  const groupId = req.params.id;
  if (!groupId) throw notFound("Group");

  await deleteGroup(req.user!.id, groupId);
  res.status(204).send();
}

/** Removes a member from a group. */
export async function deleteGroupMember(req: Request, res: Response) {
  const groupId = req.params.id;
  const memberUserId = req.params.userId;
  if (!groupId || !memberUserId) throw notFound("Group");

  await removeGroupMember(req.user!.id, groupId, memberUserId);
  res.status(204).send();
}
