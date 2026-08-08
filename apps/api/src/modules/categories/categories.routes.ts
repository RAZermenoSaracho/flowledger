import {
  categoryFiltersSchema,
  categorySchema,
  updateCategorySchema
} from "@flowledger/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postCategory } from "./controllers/create.controller.js";
import { deleteCategoryController } from "./controllers/delete.controller.js";
import { getCategories } from "./controllers/read.controller.js";
import {
  postCategoryArchive,
  postCategoryRestore,
  putCategory
} from "./controllers/update.controller.js";

/** Express router for `/categories`. */
export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  validate(categoryFiltersSchema, "query"),
  asyncHandler(getCategories)
);
categoriesRouter.post("/", validate(categorySchema), asyncHandler(postCategory));
categoriesRouter.put(
  "/:id",
  validate(updateCategorySchema),
  asyncHandler(putCategory)
);
categoriesRouter.post("/:id/archive", asyncHandler(postCategoryArchive));
categoriesRouter.post("/:id/restore", asyncHandler(postCategoryRestore));
categoriesRouter.delete("/:id", asyncHandler(deleteCategoryController));
