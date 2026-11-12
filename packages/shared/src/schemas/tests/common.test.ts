import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  currencyCodeSchema,
  dateStringSchema,
  idSchema,
  listPaginationSchema,
  moneySchema,
  optionalArraySchema,
  optionalDateStringSchema,
  paginationQuerySchema,
  timeZoneSchema
} from "../common.js";

describe("idSchema", () => {
  it("accepts a non-empty string", () => {
    expect(idSchema.safeParse("abc").success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(idSchema.safeParse("").success).toBe(false);
  });
});

describe("optionalDateStringSchema", () => {
  it("accepts undefined", () => {
    expect(optionalDateStringSchema.safeParse(undefined).success).toBe(true);
  });

  it("accepts an ISO datetime string", () => {
    expect(
      optionalDateStringSchema.safeParse("2024-01-15T00:00:00.000Z").success
    ).toBe(true);
  });

  it("accepts a plain YYYY-MM-DD date string", () => {
    expect(optionalDateStringSchema.safeParse("2024-01-15").success).toBe(true);
  });

  it("rejects a malformed date string", () => {
    expect(optionalDateStringSchema.safeParse("not-a-date").success).toBe(
      false
    );
  });
});

describe("dateStringSchema", () => {
  it.each(["2026-11-05T20:30:00.000Z", "2026-11-05T14:30:00-06:00", "2026-11-05T14:30:00+14:00", "2026-11-05"])(
    "accepts %s",
    (value) => {
      expect(dateStringSchema.safeParse(value).success).toBe(true);
    }
  );

  it.each(["garbage", "11/05/2026", "2026-11-05T14:30:00", ""])("rejects %s", (value) => {
    expect(dateStringSchema.safeParse(value).success).toBe(false);
  });
});

describe("timeZoneSchema", () => {
  it.each(["America/Mexico_City", "UTC"])("accepts %s", (value) => {
    expect(timeZoneSchema.safeParse(value).success).toBe(true);
  });

  it.each(["Not/AZone", ""])("rejects %s", (value) => {
    expect(timeZoneSchema.safeParse(value).success).toBe(false);
  });
});

describe("moneySchema", () => {
  it("coerces a numeric string to a number", () => {
    expect(moneySchema.parse("42.5")).toBe(42.5);
  });

  it("accepts a finite number", () => {
    expect(moneySchema.parse(-10)).toBe(-10);
  });

  it("rejects Infinity", () => {
    expect(moneySchema.safeParse(Infinity).success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    expect(moneySchema.safeParse("not-a-number").success).toBe(false);
  });
});

describe("currencyCodeSchema", () => {
  it("trims and uppercases the code", () => {
    expect(currencyCodeSchema.parse(" usd ")).toBe("USD");
  });

  it("rejects a code shorter than 2 characters", () => {
    expect(currencyCodeSchema.safeParse("U").success).toBe(false);
  });

  it("rejects a code longer than 10 characters", () => {
    expect(currencyCodeSchema.safeParse("A".repeat(11)).success).toBe(false);
  });
});

describe("paginationQuerySchema", () => {
  it("coerces string limit/offset to numbers", () => {
    expect(paginationQuerySchema.parse({ limit: "25", offset: "50" })).toEqual({
      limit: 25,
      offset: 50
    });
  });

  it("accepts an empty object (both fields optional)", () => {
    expect(paginationQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects a limit above 100", () => {
    expect(paginationQuerySchema.safeParse({ limit: "101" }).success).toBe(
      false
    );
  });

  it("rejects a negative offset", () => {
    expect(paginationQuerySchema.safeParse({ offset: "-1" }).success).toBe(
      false
    );
  });
});

describe("optionalArraySchema", () => {
  const schema = z.object({ ids: optionalArraySchema(z.string()) });

  it("normalizes a single value into an array", () => {
    expect(schema.parse({ ids: "a" })).toEqual({ ids: ["a"] });
  });

  it("passes an array of values through unchanged", () => {
    expect(schema.parse({ ids: ["a", "b"] })).toEqual({ ids: ["a", "b"] });
  });

  it("filters out empty-string entries", () => {
    expect(schema.parse({ ids: ["a", "", "b"] })).toEqual({ ids: ["a", "b"] });
  });

  it("leaves the field undefined when omitted", () => {
    expect(schema.parse({})).toEqual({ ids: undefined });
  });
});

describe("listPaginationSchema", () => {
  it("accepts offset and cursor pagination", () => {
    expect(listPaginationSchema.safeParse({ kind: "offset", page: 1, pageSize: 10 }).success).toBe(true);
    expect(
      listPaginationSchema.safeParse({ kind: "cursor", take: 5, direction: "backward" }).success
    ).toBe(true);
  });

  it.each([
    { kind: "offset", page: 0, pageSize: 10 },
    { kind: "offset", page: 1, pageSize: 0 },
    { kind: "offset", page: 1, pageSize: 1.5 },
    { kind: "offset", page: 1, pageSize: "x" },
    { kind: "cursor", take: 0 },
    { kind: "cursor", take: 5, direction: "sideways" },
    { kind: "page", page: 1 }
  ])("rejects %j", (value) => {
    expect(listPaginationSchema.safeParse(value).success).toBe(false);
  });
});
