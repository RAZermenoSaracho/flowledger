import { describe, expect, it } from "vitest";
import type { AccountDraft } from "../../types/accounts.types";
import { creditCardBody, creditCardFields } from "../creditCardDraft";
import { validateAccountDraft } from "../accountValidation";

const draft: AccountDraft = {
  name: "Visa",
  type: "credit_card",
  identifier: "",
  currency: "MXN",
  initialBalance: "0",
  creditLimit: "30000",
  statementClosingDay: "20",
  paymentDueRule: "day_of_next_month",
  paymentDueValue: "10",
  billingTimeZone: "America/Mexico_City",
  annualInterestRate: "",
  holdings: []
};

describe("credit card draft helpers", () => {
  it("maps empty inputs to null", () => {
    expect(creditCardFields({ ...draft, annualInterestRate: "", creditLimit: "" })).toMatchObject({
      creditLimit: null,
      annualInterestRate: null,
      statementClosingDay: 20
    });
  });

  it("sends all four cycle fields when one changes, and only changed others", () => {
    const body = creditCardBody(draft, ["statementClosingDay"]);
    expect(Object.keys(body).sort()).toEqual(
      ["billingTimeZone", "paymentDueRule", "paymentDueValue", "statementClosingDay"].sort()
    );
    expect(creditCardBody(draft, ["creditLimit"])).toEqual({ creditLimit: "30000" });
  });

  it("shows shared-schema errors per field for a partial cycle and a late due value", () => {
    expect(validateAccountDraft({ ...draft })).toEqual({});
    const partial = validateAccountDraft({ ...draft, paymentDueValue: "", billingTimeZone: "" });
    expect(partial.paymentDueValue).toBeTruthy();
    expect(partial.billingTimeZone).toBeTruthy();
    expect(validateAccountDraft({ ...draft, paymentDueValue: "25" }).paymentDueValue).toBeTruthy();
  });
});
