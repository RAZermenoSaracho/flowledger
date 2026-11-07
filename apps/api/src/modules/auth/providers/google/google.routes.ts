import {
  googleOAuthCallbackQuerySchema,
  googleOAuthStartQuerySchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth.js";
import { validate } from "../../../../middleware/validate.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import {
  googleLinkStart,
  googleLinkStatus,
  googleOAuthCallback,
  googleOAuthStart
} from "./controllers/create.controller.js";

/** Express router for Google OAuth start (`/`), callback (`/callback`), and the signed-in link flow (`/link`), mounted at `/auth/google`. */
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
