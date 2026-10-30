import { createApiKeySchema } from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postApiKey } from "./controllers/create.controller.js";
import { deleteApiKey } from "./controllers/delete.controller.js";
import { getApiKeys } from "./controllers/read.controller.js";

/** Router for `/users/me/api-keys`; mounted behind `requireAuth`, so only a web JWT can manage keys. */
export const apiKeysRouter = Router();

apiKeysRouter.get("/", asyncHandler(getApiKeys));
apiKeysRouter.post("/", validate(createApiKeySchema), asyncHandler(postApiKey));
apiKeysRouter.delete("/:id", asyncHandler(deleteApiKey));
