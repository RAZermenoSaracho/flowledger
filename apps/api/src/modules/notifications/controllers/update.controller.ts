import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  markAllNotificationsRead,
  markNotificationRead
} from "../services/update.service.js";

export async function markAllRead(req: Request, res: Response) {
  await markAllNotificationsRead(req.user!.id);
  res.status(204).send();
}

export async function markRead(req: Request, res: Response) {
  const notification = await markNotificationRead(req.user!.id, req.params.id!);
  res.json({ notification: serialize(notification) });
}
