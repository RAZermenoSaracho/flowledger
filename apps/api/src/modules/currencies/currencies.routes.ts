import { currencyRateQuerySchema, securitySearchQuerySchema } from "@flowledger/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { securitySearchLimiter } from "./utils/currencyRateLimits.js";
import { getCurrencies, getRate, getSecurities } from "./controllers/read.controller.js";

/** Express router for `/currencies`. */
export const currenciesRouter = Router();

currenciesRouter.get("/", asyncHandler(getCurrencies));
currenciesRouter.get(
  "/rate",
  validate(currencyRateQuerySchema, "query"),
  asyncHandler(getRate)
);
currenciesRouter.get(
  "/securities",
  requireAuth,
  securitySearchLimiter,
  validate(securitySearchQuerySchema, "query"),
  asyncHandler(getSecurities)
);
