import {
  apiUserSearchQuerySchema,
  groupCategorySchema,
  groupMemberSchema,
  groupSchema,
  groupsQueryParamSchema,
  settlementApprovalSchema,
  settlementRequestSchema,
  sharedExpenseSchema,
  sharedExpensesQueryParamSchema,
  updateGroupSchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireScope } from "../../middleware/credential.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postSettlementRequest } from "../debts/controllers/create.controller.js";
import { postApproveSettlement, postRejectSettlement } from "../debts/controllers/update.controller.js";
import { postGroup, postGroupCategory, postGroupMember } from "../groups/controllers/create.controller.js";
import { deleteGroupMember } from "../groups/controllers/delete.controller.js";
import { getGroups } from "../groups/controllers/read.controller.js";
import { postGroupArchive, postGroupRestore, putGroup } from "../groups/controllers/update.controller.js";
import { getUserSearch } from "../users/controllers/read.controller.js";
import { getSharedExpense } from "../shared-expenses/controllers/read.controller.js";
import { getV1Group, getV1SharedExpenses, postV1SharedExpense } from "./controllers/v1.groups.controller.js";
import { auditV1Write } from "./utils/v1Audit.js";

/**
 * `/v1` routes for groups, shared expenses, settlements and user search (16 of the allowlist), mounted by `v1Router`
 * after `requireCredential`. Authorization (membership, group admin, debtor/creditor) is enforced by the services.
 * Group delete, shared-expense update/delete, direct settle and batch routes are deliberately absent.
 */
export const v1GroupsRouter = Router();

v1GroupsRouter.get(
  "/groups",
  requireScope("read"),
  validate(groupsQueryParamSchema, "query"),
  asyncHandler(getGroups)
);
v1GroupsRouter.get("/groups/:id", requireScope("read"), asyncHandler(getV1Group));
v1GroupsRouter.get(
  "/users/search",
  requireScope("read"),
  validate(apiUserSearchQuerySchema, "query"),
  asyncHandler(getUserSearch)
);
v1GroupsRouter.get(
  "/shared-expenses",
  requireScope("read"),
  validate(sharedExpensesQueryParamSchema, "query"),
  asyncHandler(getV1SharedExpenses)
);
v1GroupsRouter.get("/shared-expenses/:id", requireScope("read"), asyncHandler(getSharedExpense));

v1GroupsRouter.post(
  "/groups",
  auditV1Write("group.create"),
  requireScope("write"),
  validate(groupSchema),
  asyncHandler(postGroup)
);
v1GroupsRouter.put(
  "/groups/:id",
  auditV1Write("group.update"),
  requireScope("write"),
  validate(updateGroupSchema),
  asyncHandler(putGroup)
);
v1GroupsRouter.post(
  "/groups/:id/archive",
  auditV1Write("group.archive"),
  requireScope("write"),
  asyncHandler(postGroupArchive)
);
v1GroupsRouter.post(
  "/groups/:id/restore",
  auditV1Write("group.restore"),
  requireScope("write"),
  asyncHandler(postGroupRestore)
);
v1GroupsRouter.post(
  "/groups/:id/members",
  auditV1Write("group.add_member"),
  requireScope("write"),
  validate(groupMemberSchema),
  asyncHandler(postGroupMember)
);
v1GroupsRouter.post(
  "/groups/:id/categories",
  auditV1Write("group.create_category"),
  requireScope("write"),
  validate(groupCategorySchema),
  asyncHandler(postGroupCategory)
);
v1GroupsRouter.delete(
  "/groups/:id/members/:userId",
  auditV1Write("group.remove_member"),
  requireScope("write"),
  asyncHandler(deleteGroupMember)
);
v1GroupsRouter.post(
  "/shared-expenses",
  auditV1Write("sharedExpense.create"),
  requireScope("write"),
  validate(sharedExpenseSchema),
  asyncHandler(postV1SharedExpense)
);
v1GroupsRouter.post(
  "/debts/:id/settlement-request",
  auditV1Write("settlement.request"),
  requireScope("write"),
  validate(settlementRequestSchema),
  asyncHandler(postSettlementRequest)
);
v1GroupsRouter.post(
  "/settlements/:id/approve",
  auditV1Write("settlement.approve"),
  requireScope("write"),
  validate(settlementApprovalSchema),
  asyncHandler(postApproveSettlement)
);
v1GroupsRouter.post(
  "/settlements/:id/reject",
  auditV1Write("settlement.reject"),
  requireScope("write"),
  asyncHandler(postRejectSettlement)
);
