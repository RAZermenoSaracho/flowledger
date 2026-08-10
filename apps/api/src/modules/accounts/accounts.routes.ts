import {
  accountsQueryParamSchema,
  accountSchema,
  confirmProviderAccountsSchema,
  createProviderConnectionSchema,
  institutionCatalogQuerySchema,
  providerConnectionParamsSchema,
  providerWebhookParamsSchema,
  updateAccountSchema
} from "@flowledger/shared";
import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postAccount } from "./controllers/create.controller.js";
import { deleteAccountHandler } from "./controllers/delete.controller.js";
import { getAccounts } from "./controllers/read.controller.js";
import {
  postArchiveAccount,
  postRestoreAccount,
  putAccount
} from "./controllers/update.controller.js";
import {
  postConfirmAccounts,
  postConnection
} from "./controllers/providerConnections.create.controller.js";
import {
  getConnectionStatusHandler,
  getConnectors,
  getInstitutions,
  getProviderAccounts
} from "./controllers/providerConnections.read.controller.js";
import {
  postRefreshSyncfyCredential,
  postResyncConnection,
  postResyncProviderAccount
} from "./controllers/providerConnections.update.controller.js";
import {
  getWebhookHealth,
  postWebhook
} from "./controllers/providerWebhooks.controller.js";

/** Routes for the authenticated user's own `Account` records (CRUD, archive/restore). */
export const accountsRouter = Router();
/** Provider-agnostic institution/connector/connection routes (`/providers/*`). */
export const providersRouter = Router();
/** Inbound provider webhook routes (`/providers/webhooks/*`). */
export const providerWebhooksRouter = Router();

const providerCredentialParamsSchema = z.object({
  providerCredentialId: z.string().min(1)
});

accountsRouter.get(
  "/",
  validate(accountsQueryParamSchema, "query"),
  asyncHandler(getAccounts)
);

accountsRouter.post("/", validate(accountSchema), asyncHandler(postAccount));

accountsRouter.put(
  "/:id",
  validate(updateAccountSchema),
  asyncHandler(putAccount)
);

accountsRouter.post("/:id/archive", asyncHandler(postArchiveAccount));

accountsRouter.post("/:id/restore", asyncHandler(postRestoreAccount));

accountsRouter.delete("/:id", asyncHandler(deleteAccountHandler));

providersRouter.get("/connectors", asyncHandler(getConnectors));

providersRouter.get(
  "/institutions",
  validate(institutionCatalogQuerySchema, "query"),
  asyncHandler(getInstitutions)
);

providersRouter.post(
  "/connections",
  validate(createProviderConnectionSchema),
  asyncHandler(postConnection)
);

providersRouter.get(
  "/connections/:id/status",
  validate(providerConnectionParamsSchema, "params"),
  asyncHandler(getConnectionStatusHandler)
);

providersRouter.post(
  "/connections/:id/resync",
  validate(providerConnectionParamsSchema, "params"),
  asyncHandler(postResyncConnection)
);

providersRouter.post(
  "/syncfy/credentials/:providerCredentialId/refresh",
  validate(providerCredentialParamsSchema, "params"),
  asyncHandler(postRefreshSyncfyCredential)
);

providersRouter.get("/accounts", asyncHandler(getProviderAccounts));

providersRouter.post(
  "/accounts/:id/resync",
  asyncHandler(postResyncProviderAccount)
);

providersRouter.post(
  "/accounts/confirm",
  validate(confirmProviderAccountsSchema),
  asyncHandler(postConfirmAccounts)
);

providerWebhooksRouter.post(
  "/:provider",
  validate(providerWebhookParamsSchema, "params"),
  asyncHandler(postWebhook)
);

providerWebhooksRouter.get(
  "/:provider",
  validate(providerWebhookParamsSchema, "params"),
  asyncHandler(getWebhookHealth)
);
