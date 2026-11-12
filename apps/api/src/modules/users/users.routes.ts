import {
  blockedUserParamsSchema,
  blockUserSchema,
  updateUserPlanSchema,
  updateUserProfileSchema,
  updateUserSidebarSideSchema,
  userSearchQuerySchema,
  usernameAvailabilityQuerySchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postBlock } from "./controllers/create.controller.js";
import { deleteBlock } from "./controllers/delete.controller.js";
import {
  getBlocks,
  getMe,
  getUsernameAvailability,
  getUserSearch
} from "./controllers/read.controller.js";
import { userSearchLimiter, usernameAvailabilityLimiter } from "./utils/userRateLimits.js";
import {
  patchMe,
  patchPlan,
  patchSidebarSide,
  postAvatar
} from "./controllers/update.controller.js";

/** Router for `/users` — profile, avatar, plan/sidebar-side updates, and user search, username availability and blocking. */
export const usersRouter = Router();

usersRouter.get(
  "/search",
  userSearchLimiter,
  validate(userSearchQuerySchema, "query"),
  asyncHandler(getUserSearch)
);
usersRouter.get(
  "/username-availability",
  usernameAvailabilityLimiter,
  validate(usernameAvailabilityQuerySchema, "query"),
  asyncHandler(getUsernameAvailability)
);
usersRouter.get("/blocks", asyncHandler(getBlocks));
usersRouter.post("/blocks", validate(blockUserSchema), asyncHandler(postBlock));
usersRouter.delete(
  "/blocks/:userId",
  validate(blockedUserParamsSchema, "params"),
  asyncHandler(deleteBlock)
);
usersRouter.get("/me", asyncHandler(getMe));
usersRouter.patch("/me", validate(updateUserProfileSchema), asyncHandler(patchMe));
usersRouter.post("/me/avatar", asyncHandler(postAvatar));
usersRouter.patch("/me/plan", validate(updateUserPlanSchema), asyncHandler(patchPlan));
usersRouter.patch(
  "/me/sidebar-side",
  validate(updateUserSidebarSideSchema),
  asyncHandler(patchSidebarSide)
);
