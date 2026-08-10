import {
  updateUserPasswordSchema,
  updateUserPlanSchema,
  updateUserProfileSchema,
  updateUserSidebarSideSchema,
  userSearchQuerySchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getMe, getUserSearch } from "./controllers/read.controller.js";
import {
  patchMe,
  patchPassword,
  patchPlan,
  patchSidebarSide,
  postAvatar
} from "./controllers/update.controller.js";

/** Router for `/users` — profile, avatar, password/plan/sidebar-side updates, and user search. */
export const usersRouter = Router();

usersRouter.get(
  "/search",
  validate(userSearchQuerySchema, "query"),
  asyncHandler(getUserSearch)
);
usersRouter.get("/me", asyncHandler(getMe));
usersRouter.patch("/me", validate(updateUserProfileSchema), asyncHandler(patchMe));
usersRouter.post("/me/avatar", asyncHandler(postAvatar));
usersRouter.patch(
  "/me/password",
  validate(updateUserPasswordSchema),
  asyncHandler(patchPassword)
);
usersRouter.patch("/me/plan", validate(updateUserPlanSchema), asyncHandler(patchPlan));
usersRouter.patch(
  "/me/sidebar-side",
  validate(updateUserSidebarSideSchema),
  asyncHandler(patchSidebarSide)
);
