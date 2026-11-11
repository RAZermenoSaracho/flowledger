import { describe, expect, it } from "vitest";
import {
  assertNoSettlementActivity,
  assertRemovable,
  assertShareEditable,
  assertTypeChangeAllowed,
  pendingRequestAmount
} from "../shareGuards.js";

const D = (value: number) => ({ toNumber: () => value });
const participant = (overrides: Record<string, unknown> = {}) =>
  ({ id: "p1", participantName: "@friend", shareAmount: D(40), paidAmount: D(0), settlementRequests: [], ...overrides }) as never;

describe("pendingRequestAmount", () => {
  it("sums only pending requests", () => {
    expect(
      pendingRequestAmount({
        settlementRequests: [
          { status: "pending", amount: D(5) },
          { status: "pending", amount: D(2.5) },
          { status: "rejected", amount: D(100) }
        ]
      })
    ).toBe(7.5);
  });
});

describe("assertNoSettlementActivity", () => {
  it("passes with no payments and only rejected requests", () => {
    expect(() =>
      assertNoSettlementActivity([participant({ settlementRequests: [{ status: "rejected", amount: D(5) }] })], "stop sharing", "sharedExpense")
    ).not.toThrow();
  });

  it("throws a field-addressed 400 naming the participant", () => {
    expect(() =>
      assertNoSettlementActivity([participant({ paidAmount: D(1) })], "stop sharing", "sharedExpense")
    ).toThrow(expect.objectContaining({ statusCode: 400, message: expect.stringContaining("@friend") }));
  });
});

describe("assertTypeChangeAllowed", () => {
  it("allows an unchanged type and a change with no activity", () => {
    expect(() => assertTypeChangeAllowed([participant({ paidAmount: D(5) })], "expense", "expense")).not.toThrow();
    expect(() => assertTypeChangeAllowed([participant()], "expense", "income")).not.toThrow();
  });

  it("blocks a change on `type` when paid or a request is pending", () => {
    expect(() => assertTypeChangeAllowed([participant({ paidAmount: D(5) })], "expense", "income")).toThrow(
      expect.objectContaining({ details: { issues: { formErrors: [], fieldErrors: { type: expect.any(Array) } } } })
    );
    expect(() =>
      assertTypeChangeAllowed([participant({ settlementRequests: [{ status: "pending", amount: D(1) }] })], "expense", "transfer")
    ).toThrow();
  });
});

describe("assertShareEditable", () => {
  it("allows an unchanged share even when fully paid", () => {
    expect(() => assertShareEditable(participant({ paidAmount: D(40) }), 40, "f")).not.toThrow();
  });

  it("locks a fully paid share", () => {
    expect(() => assertShareEditable(participant({ paidAmount: D(40) }), 50, "f")).toThrow("fully paid");
  });

  it("requires the share to stay at or above paid plus pending", () => {
    const p = participant({ paidAmount: D(10), settlementRequests: [{ status: "pending", amount: D(10) }] });
    expect(() => assertShareEditable(p, 19.99, "f")).toThrow();
    expect(() => assertShareEditable(p, 20, "f")).not.toThrow();
  });
});

describe("assertRemovable", () => {
  it("allows an untouched participant and blocks a paid or pending one", () => {
    expect(() => assertRemovable(participant(), "f")).not.toThrow();
    expect(() => assertRemovable(participant({ paidAmount: D(1) }), "f")).toThrow();
    expect(() => assertRemovable(participant({ settlementRequests: [{ status: "pending", amount: D(1) }] }), "f")).toThrow();
  });
});
