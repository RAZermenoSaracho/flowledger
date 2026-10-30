import {
  importProviderImportedTransactionSchema,
  notificationParamsSchema,
  publicBatchImportedSchema,
  publicBatchImportImportedSchema,
  updateProviderImportedTransactionSchema,
  updateUserPreferencesSchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireScope } from "../../middleware/credential.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUnreadCount } from "../notifications/controllers/read.controller.js";
import { markAllRead, markRead } from "../notifications/controllers/update.controller.js";
import { postBatchImport, postImportedTransactionImport } from "../transactions/controllers/create.controller.js";
import {
  patchImportedTransaction,
  postBatchIgnore,
  postBatchUnignore,
  postIgnoreImportedTransaction,
  postUnignoreImportedTransaction
} from "../transactions/controllers/update.controller.js";
import { getMe } from "../users/controllers/read.controller.js";
import { patchV1Me } from "./controllers/v1.profile.controller.js";
import { auditV1Write } from "./utils/v1Audit.js";

/**
 * `/v1` routes for the imported-transaction review queue, notification state and the caller's own profile, mounted
 * by `v1Router` after `requireCredential`. The batch routes accept only `selection.mode = "ids"` (max 50); the web
 * app's "all/filtered" mode is rejected by validation.
 */
export const v1MiscRouter = Router();

v1MiscRouter.get("/notifications/unread-count", requireScope("read"), asyncHandler(getUnreadCount));
v1MiscRouter.get("/me", requireScope("read"), asyncHandler(getMe));

v1MiscRouter.patch(
  "/notifications/read-all",
  auditV1Write("notification.read_all"),
  requireScope("write"),
  asyncHandler(markAllRead)
);
v1MiscRouter.patch(
  "/notifications/:id/read",
  auditV1Write("notification.read"),
  requireScope("write"),
  validate(notificationParamsSchema, "params"),
  asyncHandler(markRead)
);
v1MiscRouter.patch(
  "/me",
  auditV1Write("profile.update"),
  requireScope("write"),
  validate(updateUserPreferencesSchema),
  asyncHandler(patchV1Me)
);

v1MiscRouter.post(
  "/imported-transactions/batch-ignore",
  auditV1Write("imported.batch_ignore"),
  requireScope("write"),
  validate(publicBatchImportedSchema),
  asyncHandler(postBatchIgnore)
);
v1MiscRouter.post(
  "/imported-transactions/batch-unignore",
  auditV1Write("imported.batch_unignore"),
  requireScope("write"),
  validate(publicBatchImportedSchema),
  asyncHandler(postBatchUnignore)
);
v1MiscRouter.post(
  "/imported-transactions/batch-import",
  auditV1Write("imported.batch_import"),
  requireScope("write"),
  validate(publicBatchImportImportedSchema),
  asyncHandler(postBatchImport)
);
v1MiscRouter.patch(
  "/imported-transactions/:id",
  auditV1Write("imported.update"),
  requireScope("write"),
  validate(updateProviderImportedTransactionSchema),
  asyncHandler(patchImportedTransaction)
);
v1MiscRouter.post(
  "/imported-transactions/:id/ignore",
  auditV1Write("imported.ignore"),
  requireScope("write"),
  asyncHandler(postIgnoreImportedTransaction)
);
v1MiscRouter.post(
  "/imported-transactions/:id/unignore",
  auditV1Write("imported.unignore"),
  requireScope("write"),
  asyncHandler(postUnignoreImportedTransaction)
);
v1MiscRouter.post(
  "/imported-transactions/:id/import",
  auditV1Write("imported.import"),
  requireScope("write"),
  validate(importProviderImportedTransactionSchema),
  asyncHandler(postImportedTransactionImport)
);
