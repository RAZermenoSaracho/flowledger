import {
  sharedExpenseFiltersSchema,
  sharedExpenseSchema,
  updateSharedExpenseSchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postSharedExpense } from "./controllers/create.controller.js";
import { deleteSharedExpenseController } from "./controllers/delete.controller.js";
import { getSharedExpense, getSharedExpenses } from "./controllers/read.controller.js";
import { putSharedExpense } from "./controllers/update.controller.js";

/** Express router mounted at `/shared-expenses`. */
export const sharedExpensesRouter = Router();

sharedExpensesRouter.get(
  "/",
  validate(sharedExpenseFiltersSchema, "query"),
  asyncHandler(getSharedExpenses)
);
sharedExpensesRouter.post(
  "/",
  validate(sharedExpenseSchema),
  asyncHandler(postSharedExpense)
);
sharedExpensesRouter.get("/:id", asyncHandler(getSharedExpense));
sharedExpensesRouter.put(
  "/:id",
  validate(updateSharedExpenseSchema),
  asyncHandler(putSharedExpense)
);
sharedExpensesRouter.delete("/:id", asyncHandler(deleteSharedExpenseController));
