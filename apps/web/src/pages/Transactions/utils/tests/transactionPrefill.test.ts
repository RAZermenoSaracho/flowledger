import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTransactionPrefill } from "../transactionPrefill";

const parse = (query: string) => parseTransactionPrefill(new URLSearchParams(query));

describe("parseTransactionPrefill", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Mexico_City";
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("reads every whitelisted param", () => {
    expect(
      parse(
        "type=income&amount=25.5&currency=eur&accountId=a1&categoryId=c1&groupId=g1&description=Lunch&date=2026-11-05T20:30:00.000Z"
      )
    ).toEqual({
      type: "income",
      amount: "25.5",
      executionCurrency: "EUR",
      accountId: "a1",
      categoryId: "c1",
      groupId: "g1",
      name: "Lunch",
      date: "2026-11-05T14:30"
    });
  });

  it("enables sharing only for shared=1", () => {
    expect(parse("shared=1")).toEqual({ isShared: true });
  });

  it.each(["0", "yes", "true"])("ignores shared=%s", (value) => {
    expect(parse(`shared=${value}`)).toEqual({});
  });

  it("ignores unknown params", () => {
    expect(parse("foo=bar&tab=sharing")).toEqual({});
  });

  it.each([
    ["type=nope"],
    ["amount=abc"],
    ["amount=-5"],
    ["amount=0"],
    ["currency=!!"],
    ["accountId=%20"],
    ["date=yesterday"],
    ["date=2026-13-45"],
    [`description=${"x".repeat(161)}`]
  ])("ignores the invalid value %s", (query) => {
    expect(parse(query)).toEqual({});
  });

  it("accepts a bare calendar day as that UTC day", () => {
    expect(parse("date=2026-11-05").date).toBe("2026-11-04T18:00");
  });
});
