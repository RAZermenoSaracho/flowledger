import {
  createNotificationModelSchema,
  notificationListQuerySchema,
  notificationTestSchema,
  updateNotificationModelSchema,
  validateNotificationCodeSchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postModel } from "./controllers/create.controller.js";
import { deleteModelController } from "./controllers/delete.controller.js";
import { getModel, getModelLogs, getModelQueue, getModels } from "./controllers/read.controller.js";
import { postTest, postValidate } from "./controllers/test.controller.js";
import { putModel } from "./controllers/update.controller.js";

/** Router for `/notification-models` (JWT): model CRUD, code validation, test, queue and logs. Library routes live elsewhere. */
export const notificationModelsRouter = Router();

notificationModelsRouter.get("/", validate(notificationListQuerySchema, "query"), asyncHandler(getModels));
notificationModelsRouter.post("/", validate(createNotificationModelSchema), asyncHandler(postModel));
notificationModelsRouter.post("/validate", validate(validateNotificationCodeSchema), asyncHandler(postValidate));
notificationModelsRouter.get("/:id", asyncHandler(getModel));
notificationModelsRouter.put("/:id", validate(updateNotificationModelSchema), asyncHandler(putModel));
notificationModelsRouter.delete("/:id", asyncHandler(deleteModelController));
notificationModelsRouter.post("/:id/test", validate(notificationTestSchema), asyncHandler(postTest));
notificationModelsRouter.get("/:id/queue", validate(notificationListQuerySchema, "query"), asyncHandler(getModelQueue));
notificationModelsRouter.get("/:id/logs", validate(notificationListQuerySchema, "query"), asyncHandler(getModelLogs));
