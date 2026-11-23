import {
  googleOAuthCallbackQuerySchema,
  googleOAuthStartQuerySchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth.js";
import { requireWebOrigin } from "../../../../middleware/requireWebOrigin.js";
import { validate } from "../../../../middleware/validate.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import {
  googleLinkComplete,
  googleLinkStart,
  googleLinkStatus,
  googleOAuthCallback,
  googleOAuthStart
} from "./controllers/create.controller.js";

/** Express router for Google OAuth start (`/`), callback (`/callback`), and the signed-in link flow (`/link`, plus `/link/complete`, which redeems the callback's pending-link cookie under a bearer token), mounted at `/auth/google`. */
export const googleRouter = Router();

googleRouter.get(
  "/",
  validate(googleOAuthStartQuerySchema, "query"),
  asyncHandler(googleOAuthStart)
);

googleRouter.get(
  "/callback",
  validate(googleOAuthCallbackQuerySchema, "query"),
  asyncHandler(googleOAuthCallback)
);

googleRouter.post("/link", requireAuth, asyncHandler(googleLinkStart));
googleRouter.get("/link", requireAuth, asyncHandler(googleLinkStatus));
googleRouter.post(
  "/link/complete",
  requireWebOrigin,
  requireAuth,
  asyncHandler(googleLinkComplete)
);
