import { currencyRateQuerySchema } from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getCurrencies, getRate } from "./controllers/read.controller.js";

/** Express router for `/currencies`. */
export const currenciesRouter = Router();

currenciesRouter.get("/", asyncHandler(getCurrencies));
currenciesRouter.get(
  "/rate",
  validate(currencyRateQuerySchema, "query"),
  asyncHandler(getRate)
);
