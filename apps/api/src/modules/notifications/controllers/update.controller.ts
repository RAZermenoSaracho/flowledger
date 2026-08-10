import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  markAllNotificationsRead,
  markNotificationRead
} from "../services/update.service.js";

/** Marks every unread notification for the caller as read. */
export async function markAllRead(req: Request, res: Response) {
  await markAllNotificationsRead(req.user!.id);
  res.status(204).send();
}

/** Marks the notification identified by `req.params.id` as read, if owned by the caller. */
export async function markRead(req: Request, res: Response) {
  const notification = await markNotificationRead(req.user!.id, req.params.id!);
  res.json({ notification: serialize(notification) });
}
