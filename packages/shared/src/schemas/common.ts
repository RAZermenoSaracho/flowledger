import { z } from "zod";

export const idSchema = z.string().min(1);

export const optionalDateStringSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .optional();

export const moneySchema = z.coerce.number().finite();

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});
