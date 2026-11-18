import type { SecurityMarketQuote } from "@flowledger/shared";
import { describe, expect, it } from "vitest";
import { staleReasonText } from "../securityQuote";

const quote: SecurityMarketQuote = {
  provider: "twelve_data",
  price: "1",
  currency: "USD",
  quotedAt: null,
  checkedAt: null,
  stale: true,
  failureReason: null
};

describe("staleReasonText", () => {
  it("maps a failure reason to readable text", () => {
    expect(staleReasonText({ ...quote, failureReason: "plan_restricted" })).toMatch(/not covered/);
  });

  it("explains an old quote without a failure", () => {
    expect(staleReasonText(quote)).toMatch(/older than expected/);
  });
});
