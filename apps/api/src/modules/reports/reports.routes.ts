import { reportFiltersSchema } from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  getByCategory,
  getMonthlyCashflow,
  getSummary
} from "./controllers/read.controller.js";

/** Express router mounted at `/reports`. */
export const reportsRouter = Router();

reportsRouter.get(
  "/summary",
  validate(reportFiltersSchema, "query"),
  asyncHandler(getSummary)
);

reportsRouter.get(
  "/by-category",
  validate(reportFiltersSchema, "query"),
  asyncHandler(getByCategory)
);

reportsRouter.get(
  "/monthly-cashflow",
  validate(reportFiltersSchema, "query"),
  asyncHandler(getMonthlyCashflow)
);
