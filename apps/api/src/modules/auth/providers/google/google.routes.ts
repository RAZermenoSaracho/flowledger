import {
  googleOAuthCallbackQuerySchema,
  googleOAuthStartQuerySchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../../../middleware/validate.js";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import {
  googleOAuthCallback,
  googleOAuthStart
} from "./controllers/create.controller.js";

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
