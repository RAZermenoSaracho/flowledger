import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { countUnreadNotifications, listNotifications } from "../services/read.service.js";

export async function getNotifications(req: Request, res: Response) {
  const notifications = await listNotifications(req.user!.id);
  res.json({ notifications: serialize(notifications) });
}

export async function getUnreadCount(req: Request, res: Response) {
  const count = await countUnreadNotifications(req.user!.id);
  res.json({ count });
}
