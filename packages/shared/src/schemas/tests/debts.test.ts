import { describe, expect, it } from "vitest";
import {
  batchSettlementApprovalSchema,
  batchSettlementRequestSchema,
  directSettlementSchema,
  settlementApprovalSchema,
  settlementRequestSchema
} from "../debts.js";

describe("settlementRequestSchema", () => {
  const valid = { amount: 100, accountId: "acc-1", categoryId: "cat-1" };

  it("accepts a valid settlement request", () => {
    expect(settlementRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a zero amount", () => {
    expect(
      settlementRequestSchema.safeParse({ ...valid, amount: 0 }).success
    ).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(
      settlementRequestSchema.safeParse({ ...valid, amount: -5 }).success
    ).toBe(false);
  });

  it("rejects a missing accountId", () => {
    const { accountId: _accountId, ...withoutAccount } = valid;
    expect(settlementRequestSchema.safeParse(withoutAccount).success).toBe(
      false
    );
  });
});

describe("directSettlementSchema", () => {
  it("accepts an empty object (note is optional)", () => {
    expect(directSettlementSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a null note", () => {
    expect(directSettlementSchema.safeParse({ note: null }).success).toBe(
      true
    );
  });
});

describe("settlementApprovalSchema", () => {
  it("accepts a valid approval", () => {
    expect(
      settlementApprovalSchema.safeParse({
        accountId: "acc-1",
        categoryId: "cat-1"
      }).success
    ).toBe(true);
  });

  it("rejects a missing categoryId", () => {
    expect(
      settlementApprovalSchema.safeParse({ accountId: "acc-1" }).success
    ).toBe(false);
  });
});

describe("batchSettlementApprovalSchema", () => {
  it("accepts a non-empty approvals array", () => {
    expect(
      batchSettlementApprovalSchema.safeParse({
        approvals: [
          { settlementRequestId: "sr-1", accountId: "acc-1", categoryId: "cat-1" }
        ]
      }).success
    ).toBe(true);
  });

  it("rejects an empty approvals array", () => {
    expect(
      batchSettlementApprovalSchema.safeParse({ approvals: [] }).success
    ).toBe(false);
  });
});

describe("batchSettlementRequestSchema", () => {
  it("accepts a non-empty requests array", () => {
    expect(
      batchSettlementRequestSchema.safeParse({
        requests: [
          { debtId: "debt-1", amount: 50, accountId: "acc-1", categoryId: "cat-1" }
        ]
      }).success
    ).toBe(true);
  });

  it("rejects an empty requests array", () => {
    expect(
      batchSettlementRequestSchema.safeParse({ requests: [] }).success
    ).toBe(false);
  });
});
