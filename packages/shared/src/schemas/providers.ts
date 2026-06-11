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

export const createProviderConnectionSchema = z
  .object({
    institutionId: z.string().trim().min(1).max(100).optional(),
    provider: z.string().trim().min(1).max(50).optional()
  })
  .refine((value) => value.institutionId || value.provider, {
    message: "Provider or institution is required",
    path: ["provider"]
  });

export const providerConnectionParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export const confirmProviderAccountsSchema = z.object({
  accounts: z
    .array(
      z.object({
        providerAccountId: z.string().trim().min(1),
        accountId: z.string().trim().min(1).optional()
      })
    )
    .min(1)
    .max(50)
});

export const providerWebhookParamsSchema = z.object({
  provider: z.string().trim().min(1).max(50)
});
