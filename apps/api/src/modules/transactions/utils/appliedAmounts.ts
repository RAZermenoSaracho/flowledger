import { Prisma } from "@prisma/client";
import { currencyFractionDigits, exceedsCurrencyPrecision } from "@flowledger/shared";
import { fieldError } from "../../shared-expenses/utils/shareGuards.js";
import type { AppliedAmounts, AppliedAmountsInput } from "../types/transactions.types.js";

function assertPrecision(field: string, value: string, currency: string) {
  const digits = currencyFractionDigits(currency);
  if (exceedsCurrencyPrecision(value, currency)) {
    throw fieldError(
      field,
      `${field} allows at most ${digits} decimal places for ${currency}`
    );
  }
}

/** Applies one side: copies `amount` when the currencies match (a differing stated value is rejected), otherwise requires and returns the stated value. */
function resolveSide(
  field: "accountAmount" | "destinationAmount",
  amount: string,
  executionCurrency: string,
  targetCurrency: string,
  stated: string | null | undefined
) {
  if (targetCurrency === executionCurrency) {
    if (stated != null && !new Prisma.Decimal(stated).equals(amount)) {
      throw fieldError(
        field,
        `${field} must equal amount when the currencies match`
      );
    }
    return new Prisma.Decimal(amount);
  }
  if (stated == null) {
    throw fieldError(
      field,
      `${field} is required when ${executionCurrency} differs from ${targetCurrency}`
    );
  }
  assertPrecision(field, stated, targetCurrency);
  return new Prisma.Decimal(stated);
}

/**
 * Pure resolver for the amounts a transaction applies to its accounts. Never looks up a rate:
 * equal currencies copy `amount` exactly (a mismatching stated value is a 400), differing
 * currencies require the stated value (a 400 naming the missing field). Precision is checked
 * per currency (`currencyFractionDigits`) and never rounded. A fee needs both `feeAmount` and
 * `feeCurrency`, and the currency must be the execution currency, or the destination currency for a transfer / the account currency otherwise.
 * Callers pass the merged request-over-stored state so updates are validated as a whole.
 */
export function resolveAppliedAmounts(input: AppliedAmountsInput): AppliedAmounts {
  const executionCurrency = input.executionCurrency.toUpperCase();
  const accountCurrency = input.accountCurrency?.toUpperCase() ?? null;
  const destinationCurrency =
    input.type === "transfer" ? (input.destinationCurrency?.toUpperCase() ?? null) : null;

  assertPrecision("amount", input.amount, executionCurrency);

  if (accountCurrency === null && input.accountAmount != null) {
    throw fieldError("accountAmount", "accountAmount requires an account");
  }
  if (destinationCurrency === null && input.destinationAmount != null) {
    throw fieldError("destinationAmount", "destinationAmount requires a transfer to an account");
  }

  const accountAmount =
    accountCurrency === null
      ? null
      : resolveSide("accountAmount", input.amount, executionCurrency, accountCurrency, input.accountAmount);
  const destinationAmount =
    destinationCurrency === null
      ? null
      : resolveSide(
          "destinationAmount",
          input.amount,
          executionCurrency,
          destinationCurrency,
          input.destinationAmount
        );

  const hasFeeAmount = input.feeAmount != null;
  const hasFeeCurrency = input.feeCurrency != null;
  if (hasFeeAmount !== hasFeeCurrency) {
    const missing = hasFeeAmount ? "feeCurrency" : "feeAmount";
    throw fieldError(missing, "feeAmount and feeCurrency must be provided together");
  }
  if (!hasFeeAmount) {
    return { accountAmount, destinationAmount, feeAmount: null, feeCurrency: null };
  }

  const feeCurrency = input.feeCurrency!.toUpperCase();
  const otherFeeCurrency = input.type === "transfer" ? destinationCurrency : accountCurrency;
  if (feeCurrency !== executionCurrency && feeCurrency !== otherFeeCurrency) {
    throw fieldError(
      "feeCurrency",
      input.type === "transfer"
        ? "feeCurrency must be the transaction currency or the destination account currency"
        : "feeCurrency must be the transaction currency or the account currency"
    );
  }
  assertPrecision("feeAmount", input.feeAmount!, feeCurrency);

  return {
    accountAmount,
    destinationAmount,
    feeAmount: new Prisma.Decimal(input.feeAmount!),
    feeCurrency
  };
}
