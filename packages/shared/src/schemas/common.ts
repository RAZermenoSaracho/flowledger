import { z } from "zod";

export const idSchema = z.string().min(1);

/** A datetime with `Z` or an offset, or a bare `YYYY-MM-DD` date meaning that UTC calendar day. `new Date()` reads both as UTC instants. */
export const dateStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const optionalDateStringSchema = dateStringSchema.optional();

/** An IANA timezone name the runtime recognizes, such as `America/Mexico_City`. */
export const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Invalid IANA time zone");

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
