import { z } from "zod";
import { optionalDateStringSchema } from "./common.js";

export const reportFiltersSchema = z.object({
  dateFrom: optionalDateStringSchema,
  dateTo: optionalDateStringSchema,
  groupId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional()
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;
