import { z } from "zod";
import { optionalDateStringSchema } from "./common.js";

const optionalIdArraySchema = z
  .preprocess(
    (value) => {
      if (value === undefined) return undefined;
      return Array.isArray(value) ? value : [value];
    },
    z.array(z.string().min(1)).optional()
  )
  .transform((value) => value?.filter(Boolean));

export const reportFiltersSchema = z.object({
  dateFrom: optionalDateStringSchema,
  dateTo: optionalDateStringSchema,
  groupIds: optionalIdArraySchema,
  categoryIds: optionalIdArraySchema,
  groupId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional()
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;
