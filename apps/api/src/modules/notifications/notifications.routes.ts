import { notificationParamsSchema } from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getNotifications, getUnreadCount } from "./controllers/read.controller.js";
import { markAllRead, markRead } from "./controllers/update.controller.js";

/** Express router mounted at `/notifications`. */
export const notificationsRouter = Router();

notificationsRouter.get("/", asyncHandler(getNotifications));
notificationsRouter.get("/unread-count", asyncHandler(getUnreadCount));
notificationsRouter.patch("/read-all", asyncHandler(markAllRead));
notificationsRouter.patch(
  "/:id/read",
  validate(notificationParamsSchema, "params"),
  asyncHandler(markRead)
);
