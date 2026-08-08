import {
  groupFiltersSchema,
  groupCategorySchema,
  groupMemberSchema,
  groupSchema,
  updateGroupSchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postGroup, postGroupCategory, postGroupMember } from "./controllers/create.controller.js";
import { deleteGroupController, deleteGroupMember } from "./controllers/delete.controller.js";
import { getGroup, getGroups } from "./controllers/read.controller.js";
import { postGroupArchive, postGroupRestore, putGroup } from "./controllers/update.controller.js";

/** Router for `/groups` — CRUD, archive/restore, members, and categories. */
export const groupsRouter = Router();

groupsRouter.get("/", validate(groupFiltersSchema, "query"), asyncHandler(getGroups));
groupsRouter.post("/", validate(groupSchema), asyncHandler(postGroup));
groupsRouter.put("/:id", validate(updateGroupSchema), asyncHandler(putGroup));
groupsRouter.post("/:id/archive", asyncHandler(postGroupArchive));
groupsRouter.post("/:id/restore", asyncHandler(postGroupRestore));
groupsRouter.get("/:id", asyncHandler(getGroup));
groupsRouter.delete("/:id", asyncHandler(deleteGroupController));
groupsRouter.post(
  "/:id/members",
  validate(groupMemberSchema),
  asyncHandler(postGroupMember)
);
groupsRouter.delete("/:id/members/:userId", asyncHandler(deleteGroupMember));
groupsRouter.post(
  "/:id/categories",
  validate(groupCategorySchema),
  asyncHandler(postGroupCategory)
);
