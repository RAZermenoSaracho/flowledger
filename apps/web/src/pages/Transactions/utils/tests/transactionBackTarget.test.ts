import { describe, expect, it } from "vitest";
import { transactionBackTarget } from "../transactionBackTarget";

describe("transactionBackTarget", () => {
  it.each(["/debts", "/groups/g1?tab=debts#balance", "/"])("accepts %s", (from) => {
    expect(transactionBackTarget(from)).toEqual({ to: from, label: "Back" });
  });

  it.each([undefined, null, 1, {}, "", "debts", "//evil.com", "https://x"])(
    "falls back for %j",
    (from) => {
      expect(transactionBackTarget(from)).toEqual({
        to: "/transactions",
        label: "Back to transactions"
      });
    }
  );
});
