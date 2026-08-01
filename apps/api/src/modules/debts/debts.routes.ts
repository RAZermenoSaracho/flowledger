import {
  batchSettlementApprovalSchema,
  batchSettlementRequestSchema,
  directSettlementSchema,
  settlementApprovalSchema,
  settlementRequestSchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  postBatchSettlementRequests,
  postSettlementRequest
} from "./controllers/create.controller.js";
import { getDebts } from "./controllers/read.controller.js";
import {
  postApproveSettlement,
  postBatchApproveSettlements,
  postRejectSettlement,
  postSettle
} from "./controllers/update.controller.js";

export const debtsRouter = Router();
export const settlementsRouter = Router();

debtsRouter.get("/", asyncHandler(getDebts));

debtsRouter.post(
  "/settlement-requests/batch",
  validate(batchSettlementRequestSchema),
  asyncHandler(postBatchSettlementRequests)
);

debtsRouter.post(
  "/:id/settlement-request",
  validate(settlementRequestSchema),
  asyncHandler(postSettlementRequest)
);

debtsRouter.post(
  "/:id/settle",
  validate(directSettlementSchema),
  asyncHandler(postSettle)
);

settlementsRouter.post(
  "/approve/batch",
  validate(batchSettlementApprovalSchema),
  asyncHandler(postBatchApproveSettlements)
);

settlementsRouter.post(
  "/:id/approve",
  validate(settlementApprovalSchema),
  asyncHandler(postApproveSettlement)
);

settlementsRouter.post("/:id/reject", asyncHandler(postRejectSettlement));
