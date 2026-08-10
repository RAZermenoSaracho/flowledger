import { z } from "zod";
import { ACCOUNT_TYPES } from "../constants/index.js";
import { currencyCodeSchema } from "./common.js";

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  identifier: z.string().trim().max(120).optional().nullable(),
  currency: currencyCodeSchema.default("USD"),
  initialBalance: z.coerce.number().finite().default(0)
});

export const updateAccountSchema = accountSchema.partial();

// GET /accounts accepts a single JSON-encoded `query` param (DSQL
// where/sort), same shape and rationale as transactions' query param — see
// apps/api's accounts read.service.ts. This schema only validates that the
// param is present/shaped as a string; the decoded JSON is validated by
// datasieve's own parse/validate pipeline.
export const accountsQueryParamSchema = z.object({
  query: z.string().max(4000).optional()
});

export type AccountInput = z.infer<typeof accountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type AccountsQueryParam = z.infer<typeof accountsQueryParamSchema>;
