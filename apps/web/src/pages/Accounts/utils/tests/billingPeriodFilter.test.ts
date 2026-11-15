import { describe, expect, it } from "vitest";
import {
  domainToWhere,
  createEmptyGroup,
  addChild
} from "../../../../utils/searchDomain";
import {
  BILLING_PERIOD_FIELD,
  billingPeriodCondition,
  billingPeriodField
} from "../billingPeriodFilter";

const START = "2026-09-21T06:00:00.000Z";
const END = "2026-10-21T06:00:00.000Z";

describe("billingPeriodField", () => {
  it("is not pickable and labelled Billing period", () => {
    const field = billingPeriodField("America/Mexico_City");
    expect(field.name).toBe(BILLING_PERIOD_FIELD);
    expect(field.pickable).toBe(false);
    expect(field.label).toBe("Billing period");
  });

  it("describes the period in the card's time zone", () => {
    const node = billingPeriodCondition(START, END);
    expect(billingPeriodField("America/Mexico_City").describe!(node)).toBe(
      "Sep 21, 2026 – Oct 20, 2026"
    );
    // 06:00Z is already 15:00 on Sep 21 in Tokyo; end - 1ms is Oct 21 14:59 there.
    expect(billingPeriodField("Asia/Tokyo").describe!(node)).toBe(
      "Sep 21, 2026 – Oct 21, 2026"
    );
  });

  it("compiles to the exact half-open instants", () => {
    const node = billingPeriodCondition(START, END);
    expect(billingPeriodField("Asia/Tokyo").compile!(node)).toEqual({
      and: [
        { field: "date", op: ">=", value: START },
        { field: "date", op: "<", value: END }
      ]
    });
    const root = createEmptyGroup("and");
    expect(
      domainToWhere(addChild(root, root.id, node), [billingPeriodField("UTC")])
    ).toEqual({
      and: [
        { field: "date", op: ">=", value: START },
        { field: "date", op: "<", value: END }
      ]
    });
  });
});
