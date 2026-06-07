import { z } from "zod";

export const institutionCategories = [
  "bank",
  "broker",
  "exchange",
  "wallet",
  "government",
  "other"
] as const;

export const institutionCatalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  provider: z.string().trim().min(1).max(50).optional(),
  country: z.string().trim().min(1).max(20).optional(),
  category: z.enum(institutionCategories).optional()
});
