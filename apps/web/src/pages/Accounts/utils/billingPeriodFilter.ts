import {
  createConditionWithValue,
  type DomainConditionNode,
  type SearchFieldConfig
} from "../../../utils/searchDomain";

/** SearchBar field name of the billing-period condition on an account's Transactions tab. */
export const BILLING_PERIOD_FIELD = "billingPeriod";

/**
 * Non-pickable SearchBar field for a credit card's billing period. A condition holds the period's half-open
 * `[startAt, endAt)` instants exactly as the billing API computes them in the card's billing time zone, compiles to
 * `date >= startAt AND date < endAt` with no device-zone or end-of-day rounding, and reads as the period's local
 * dates in `timeZone`. The account tab widens its scope to transfers into the card while one is present.
 */
export function billingPeriodField(timeZone: string): SearchFieldConfig {
  const day = new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium"
  });
  return {
    name: BILLING_PERIOD_FIELD,
    label: "Billing period",
    type: "date",
    ops: ["between"],
    pickable: false,
    compile: (node) => {
      const [startAt, endAt] = node.value as [string, string];
      return {
        and: [
          { field: "date", op: ">=", value: startAt },
          { field: "date", op: "<", value: endAt }
        ]
      };
    },
    describe: (node) => {
      const [startAt, endAt] = node.value as [string, string];
      return `${day.format(new Date(startAt))} – ${day.format(new Date(new Date(endAt).getTime() - 1))}`;
    }
  };
}

/** A billing-period condition for the half-open `[startAt, endAt)` instants of one period. */
export function billingPeriodCondition(
  startAt: string,
  endAt: string
): DomainConditionNode {
  return createConditionWithValue(BILLING_PERIOD_FIELD, "between", [
    startAt,
    endAt
  ]);
}
