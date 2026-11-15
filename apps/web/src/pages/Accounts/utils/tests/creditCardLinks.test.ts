import { describe, expect, it } from "vitest";
import {
  creditCardTabPath,
  externalPaymentPath,
  interestChargePath,
  payCardPath,
  periodTransactionsPath
} from "../creditCardLinks";

function parse(path: string) {
  const [pathname, query] = path.split("?");
  return { pathname, params: Object.fromEntries(new URLSearchParams(query)) };
}

describe("credit card links", () => {
  it("builds the Credit card tab path", () => {
    expect(creditCardTabPath("c1")).toBe("/accounts/c1?tab=credit-card");
  });

  it("builds the pay draft as a transfer into the card", () => {
    expect(parse(payCardPath("c1", "4000", "MXN"))).toEqual({
      pathname: "/transactions/new",
      params: { type: "transfer", amount: "4000", currency: "MXN", transferToAccountId: "c1" }
    });
  });

  it("builds the external payment draft as card income classified payment", () => {
    expect(parse(externalPaymentPath("c1")).params).toEqual({
      type: "income",
      accountId: "c1",
      creditCardKind: "payment"
    });
  });

  it("builds the interest draft as card expense classified interest", () => {
    expect(parse(interestChargePath("c1")).params).toEqual({
      type: "expense",
      accountId: "c1",
      creditCardKind: "interest"
    });
  });

  it("builds the period drill-down path", () => {
    expect(
      parse(
        periodTransactionsPath("c1", {
          start: "2027-01-21",
          end: "2027-02-20",
          startAt: "2027-01-21T06:00:00.000Z",
          endAt: "2027-02-21T06:00:00.000Z"
        })
      ).params
    ).toEqual({
      tab: "transactions",
      periodFrom: "2027-01-21",
      periodTo: "2027-02-20",
      periodStartAt: "2027-01-21T06:00:00.000Z",
      periodEndAt: "2027-02-21T06:00:00.000Z"
    });
  });
});
