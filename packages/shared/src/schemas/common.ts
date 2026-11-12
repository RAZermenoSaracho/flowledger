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

/** A native money amount as an exact decimal string: up to 12 integer and 18 fraction digits, no exponent. Numbers are rejected so no float ever carries a balance. */
export const decimalAmountSchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,18})?$/, "Amount must be a decimal string with at most 12 integer and 18 fraction digits");

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

/** DataSieve list pagination: numbered pages (`offset`) or a keyset cursor (`cursor`). Sizes are positive integers; the API additionally clamps them to a per-list maximum. */
export const listPaginationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("offset"),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1)
  }),
  z.object({
    kind: z.literal("cursor"),
    cursor: z.string().optional(),
    take: z.number().int().min(1),
    direction: z.enum(["forward", "backward"]).optional()
  })
]);

/** DataSieve list sort: an ordered array of `{ field, direction? }` keys. */
export const listSortSchema = z.array(
  z.object({ field: z.string().min(1), direction: z.enum(["asc", "desc"]).optional() })
);

const isoCurrencies = new Set<string>(Intl.supportedValuesOf("currency"));

/** Number of fraction digits in a decimal string (`"1.50"` is 2, `"3"` is 0). */
export function decimalPlaces(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

/** Minor-unit digits of an ISO 4217 code (USD 2, JPY 0, KWD 3); any non-ISO code (crypto) gets 18. */
export function currencyFractionDigits(code: string): number {
  const currency = code.toUpperCase();
  if (!isoCurrencies.has(currency)) return 18;
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits as number;
}

/** True for ISO currencies with at most 2 minor-unit digits, the only ones shared-expense and settlement `Decimal(12,2)` columns hold exactly. */
export function isShareableCurrency(code: string): boolean {
  return isoCurrencies.has(code.toUpperCase()) && currencyFractionDigits(code) <= 2;
}
