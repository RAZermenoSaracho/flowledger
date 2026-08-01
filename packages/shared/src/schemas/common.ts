import { z } from "zod";

export const idSchema = z.string().min(1);

export const optionalDateStringSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .optional();

export const moneySchema = z.coerce.number().finite();

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(10);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

// Accepts a single query-string value or repeated values (?x=a&x=b) and
// always normalizes to an array, for multi-select filter facets.
export function optionalArraySchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .preprocess((value) => {
      if (value === undefined) return undefined;
      return Array.isArray(value) ? value : [value];
    }, z.array(itemSchema).optional())
    .transform((value) => value?.filter((item) => item !== ""));
}
