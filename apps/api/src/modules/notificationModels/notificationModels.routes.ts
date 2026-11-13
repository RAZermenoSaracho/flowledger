import {
  createNotificationModelSchema,
  notificationListQuerySchema,
  notificationTestSchema,
  parseNotificationRulesSchema,
  updateFromSourceSchema,
  updateNotificationModelSchema,
  validateNotificationCodeSchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getLibrary, getLibraryEntry, postInstall, postPublish, postUpdateFromSource } from "./controllers/library.controller.js";
import { postModel } from "./controllers/create.controller.js";
import { deleteModelController } from "./controllers/delete.controller.js";
import { getModel, getModelLogs, getModelQueue, getModels } from "./controllers/read.controller.js";
import { postParseRules, postTest, postValidate } from "./controllers/test.controller.js";
import { putModel } from "./controllers/update.controller.js";

/** Router for `/notification-models` (JWT): model CRUD, code validation, test, queue and logs. Publish and update-from-source live here. */
export const notificationModelsRouter = Router();

notificationModelsRouter.get("/", validate(notificationListQuerySchema, "query"), asyncHandler(getModels));
notificationModelsRouter.post("/", validate(createNotificationModelSchema), asyncHandler(postModel));
notificationModelsRouter.post("/validate", validate(validateNotificationCodeSchema), asyncHandler(postValidate));
notificationModelsRouter.post("/parse-rules", validate(parseNotificationRulesSchema), asyncHandler(postParseRules));
notificationModelsRouter.get("/:id", asyncHandler(getModel));
notificationModelsRouter.put("/:id", validate(updateNotificationModelSchema), asyncHandler(putModel));
notificationModelsRouter.delete("/:id", asyncHandler(deleteModelController));
notificationModelsRouter.post("/:id/test", validate(notificationTestSchema), asyncHandler(postTest));
notificationModelsRouter.get("/:id/queue", validate(notificationListQuerySchema, "query"), asyncHandler(getModelQueue));
notificationModelsRouter.get("/:id/logs", validate(notificationListQuerySchema, "query"), asyncHandler(getModelLogs));
notificationModelsRouter.post("/:id/publish", asyncHandler(postPublish));
notificationModelsRouter.post("/:id/update-from-source", validate(updateFromSourceSchema), asyncHandler(postUpdateFromSource));

/** Router for `/notification-library` (JWT): browse public models, view the latest version and install a copy. */
export const notificationLibraryRouter = Router();

notificationLibraryRouter.get("/", asyncHandler(getLibrary));
notificationLibraryRouter.get("/:modelId", asyncHandler(getLibraryEntry));
notificationLibraryRouter.post("/:modelId/install", asyncHandler(postInstall));
