import { z } from "zod";
import {
  ACCOUNT_TYPES,
  HOLDING_KINDS,
  MAX_DAYS_AFTER_CLOSING,
  PAYMENT_DUE_RULES
} from "../constants/index.js";
import {
  currencyCodeSchema,
  currencyFractionDigits,
  decimalAmountSchema,
  exceedsCurrencyPrecision,
  positiveDecimalAmountSchema,
  timeZoneSchema
} from "./common.js";

const percentRateSchema = decimalAmountSchema.refine(
  (value) => !value.startsWith("-") && Number(value) <= 1000,
  "Rate must be between 0 and 1000"
);

/** Flat account fields, kept un-refined so `.shape` and `.partial()` stay available (MCP tool inputs, updates). Credit-card fields are only valid for `credit_card` accounts; see {@link refineCreditCardAccount}. */
export const accountBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  identifier: z.string().trim().max(120).optional().nullable(),
  currency: currencyCodeSchema.default("USD"),
  initialBalance: decimalAmountSchema.default("0"),
  creditLimit: positiveDecimalAmountSchema.optional().nullable(),
  statementClosingDay: z.number().int().min(1).max(31).optional().nullable(),
  paymentDueRule: z.enum(PAYMENT_DUE_RULES).optional().nullable(),
  paymentDueValue: z.number().int().min(1).optional().nullable(),
  billingTimeZone: timeZoneSchema.optional().nullable(),
  annualInterestRate: percentRateSchema.optional().nullable()
});

type CreditCardAccountFields = Partial<
  Pick<
    z.infer<typeof accountBaseSchema>,
    | "type"
    | "creditLimit"
    | "statementClosingDay"
    | "paymentDueRule"
    | "paymentDueValue"
    | "billingTimeZone"
    | "annualInterestRate"
  >
>;

const CARD_ONLY_FIELDS = [
  "creditLimit",
  "statementClosingDay",
  "paymentDueRule",
  "paymentDueValue",
  "billingTimeZone",
  "annualInterestRate"
] as const;

const CYCLE_FIELDS = [
  "statementClosingDay",
  "paymentDueRule",
  "paymentDueValue",
  "billingTimeZone"
] as const;

/**
 * Enforces the credit-card rules on a complete (merged) account object: card fields only on `credit_card`
 * accounts, cycle fields all-or-none, and the due value within its rule's range. Issue paths name the offending field.
 * Used by `accountSchema`; the update flow calls it on the merged stored + patched state.
 */
export function refineCreditCardAccount(
  account: CreditCardAccountFields,
  ctx: z.RefinementCtx
) {
  if (account.type !== "credit_card") {
    for (const field of CARD_ONLY_FIELDS) {
      if (account[field] != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Only credit card accounts can set this field"
        });
      }
    }
    return;
  }

  const missing = CYCLE_FIELDS.filter((field) => account[field] == null);
  if (missing.length > 0 && missing.length < CYCLE_FIELDS.length) {
    for (const field of missing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message:
          "Set the statement closing day, payment due date and billing time zone together, or leave all of them empty"
      });
    }
    return;
  }

  const { paymentDueRule, paymentDueValue, statementClosingDay } = account;
  if (
    paymentDueRule == null ||
    paymentDueValue == null ||
    statementClosingDay == null
  ) {
    return;
  }
  const max =
    paymentDueRule === "day_of_next_month"
      ? statementClosingDay
      : MAX_DAYS_AFTER_CLOSING;
  if (paymentDueValue > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentDueValue"],
      message:
        paymentDueRule === "day_of_next_month"
          ? `With a closing day of ${statementClosingDay}, the due day can be at most ${statementClosingDay} so payment is due before the next statement closes. For a due date in the same month as closing, use "days after closing".`
          : `The payment can be due at most ${MAX_DAYS_AFTER_CLOSING} days after closing, so it falls before the next statement closes (February cycles are 28 days).`
    });
  }
}

export const accountSchema = accountBaseSchema.superRefine(
  refineCreditCardAccount
);

export const updateAccountSchema = accountBaseSchema.partial();

// GET /accounts accepts a single JSON-encoded `query` param (DSQL
// where/sort), same shape and rationale as transactions' query param — see
// apps/api's accounts read.service.ts. This schema only validates that the
// param is present/shaped as a string; the decoded JSON is validated by
// datasieve's own parse/validate pipeline.
export const accountsQueryParamSchema = z.object({
  query: z.string().max(4000).optional()
});

/** Query of `GET /accounts/:id/credit-card`: which page of billing periods (newest first) to return. */
export const creditCardBillingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1)
});

export type CreditCardBillingQuery = z.infer<
  typeof creditCardBillingQuerySchema
>;
export type AccountInput = z.infer<typeof accountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type AccountsQueryParam = z.infer<typeof accountsQueryParamSchema>;

export const holdingKindSchema = z.enum(HOLDING_KINDS);

const isoCurrencyCodes = new Set<string>(Intl.supportedValuesOf("currency"));

/**
 * One item of a holdings change set. Without `id` it creates a holding and needs `kind`, `code` and `quantity`;
 * with `id` it updates only `quantity` and/or the manual valuation (`kind`/`code` are immutable).
 * `manualUnitPrice: null` clears the override. `fiat` holdings never take a manual price; `fiat` quantities
 * are limited to the currency's minor units, crypto quantities to 18 decimals. `manualPricedAt` may not be in the future.
 */
export const holdingUpsertSchema = z
  .object({
    id: z.string().min(1).optional(),
    kind: holdingKindSchema.optional(),
    code: currencyCodeSchema.optional(),
    quantity: positiveDecimalAmountSchema.optional(),
    manualUnitPrice: positiveDecimalAmountSchema.nullable().optional(),
    manualPriceCurrency: currencyCodeSchema.optional(),
    manualPricedAt: z.coerce.date().optional()
  })
  .superRefine((item, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (item.id) {
      if (item.kind !== undefined) issue("kind", "The kind of an existing holding cannot change");
      if (item.code !== undefined) issue("code", "The code of an existing holding cannot change");
    } else {
      if (!item.kind) issue("kind", "Kind is required for a new holding");
      if (!item.code) issue("code", "Code is required for a new holding");
      if (!item.quantity) issue("quantity", "Quantity is required for a new holding");
    }

    if (item.kind === "fiat") {
      if (item.code && !isoCurrencyCodes.has(item.code)) issue("code", "Cash must use an ISO 4217 currency code");
      if (item.manualUnitPrice != null) issue("manualUnitPrice", "Cash holdings are valued at par and take no manual price");
    }
    if (item.quantity && item.code && item.kind === "fiat" && exceedsCurrencyPrecision(item.quantity, item.code)) {
      issue("quantity", `${item.code} allows at most ${currencyFractionDigits(item.code)} decimals`);
    }
    if (item.manualUnitPrice != null && !item.manualPriceCurrency) {
      issue("manualPriceCurrency", "Set the currency of the manual price");
    }
    if (item.manualPricedAt && item.manualPricedAt.getTime() > Date.now()) {
      issue("manualPricedAt", "The valuation date cannot be in the future");
    }
  });

/** Body of `PATCH /accounts/:id/holdings`: an atomic change set. Holdings not mentioned are untouched; `remove` deletes by id. */
export const holdingsChangeSetSchema = z
  .object({
    upsert: z.array(holdingUpsertSchema).max(200).default([]),
    remove: z.array(z.string().min(1)).max(200).default([])
  })
  .refine((body) => body.upsert.length + body.remove.length > 0, "The change set is empty");

export type HoldingUpsertInput = z.infer<typeof holdingUpsertSchema>;
export type HoldingsChangeSetInput = z.infer<typeof holdingsChangeSetSchema>;
