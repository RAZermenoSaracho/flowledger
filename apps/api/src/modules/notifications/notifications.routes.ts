import { notificationParamsSchema } from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    res.json({ notifications: serialize(notifications) });
  })
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null }
    });

    res.json({ count });
  })
);

notificationsRouter.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() }
    });

    res.status(204).send();
  })
);

notificationsRouter.patch(
  "/:id/read",
  validate(notificationParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Notification");

    const notification = await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: existing.readAt ?? new Date() }
    });

    res.json({ notification: serialize(notification) });
  })
);
