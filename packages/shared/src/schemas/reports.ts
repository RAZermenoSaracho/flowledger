import { z } from "zod";
import { currencyCodeSchema, optionalDateStringSchema, timeZoneSchema } from "./common.js";

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
  timeZone: timeZoneSchema.optional(),
  groupIds: optionalIdArraySchema,
  categoryIds: optionalIdArraySchema,
  groupId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  currency: currencyCodeSchema.optional(),
  amountMode: z.enum(["net", "gross"]).optional()
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Query for `GET /reports/financial-overview`: only the IANA time zone used to pick the last complete month. */
export const financialOverviewQuerySchema = z.object({
  timeZone: timeZoneSchema.optional()
});

export type FinancialOverviewQuery = z.infer<typeof financialOverviewQuerySchema>;

/** Codes for the caveats the overview discloses; a code is present only when it applies. */
export const financialOverviewDisclosureSchema = z.enum([
  "archived_balance_excluded",
  "rates_missing",
  "past_month_current_rates",
  "investment_recorded_balance",
  "synced_balances"
]);

export type FinancialOverviewDisclosure = z.infer<typeof financialOverviewDisclosureSchema>;

/** Net worth in the response currency: the total, its three components, items left out for a missing rate, and the count of proposed shares not counted. `status: "error"` means only this metric failed. */
export const financialOverviewNetWorthSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    total: z.number(),
    accounts: z.number(),
    owedToMe: z.number(),
    iOwe: z.number(),
    partial: z.boolean(),
    excluded: z.array(z.string()),
    awaitingAcceptance: z.number().int().nonnegative()
  }),
  z.object({ status: z.literal("error") })
]);

/** Savings rate for `month` (`YYYY-MM`): `rate` is a percentage and only present when `status` is `ok`. */
export const financialOverviewSavingsRateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    month: z.string(),
    rate: z.number(),
    netIncome: z.number(),
    netExpenses: z.number()
  }),
  z.object({
    status: z.enum(["no_data", "unavailable_income", "unavailable_rate"]),
    month: z.string()
  }),
  z.object({ status: z.literal("error") })
]);

/** Response of `GET /reports/financial-overview`. */
export const financialOverviewResponseSchema = z.object({
  currency: z.string(),
  netWorth: financialOverviewNetWorthSchema,
  savingsRate: financialOverviewSavingsRateSchema,
  disclosures: z.array(financialOverviewDisclosureSchema)
});

export type FinancialOverview = z.infer<typeof financialOverviewResponseSchema>;
