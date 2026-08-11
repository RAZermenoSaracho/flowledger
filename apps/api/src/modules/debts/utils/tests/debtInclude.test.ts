import { describe, expect, it } from "vitest";
import { debtInclude, publicTransactionSelect } from "../debtInclude.js";

describe("publicTransactionSelect", () => {
  it("excludes account/owner-only fields like accountId or notes", () => {
    expect(publicTransactionSelect).not.toHaveProperty("accountId");
    expect(publicTransactionSelect).not.toHaveProperty("notes");
  });

  it("selects the fields safe to expose across a debt", () => {
    expect(publicTransactionSelect).toMatchObject({
      id: true,
      name: true,
      amount: true,
      type: true,
      date: true
    });
  });
});

describe("debtInclude", () => {
  it("includes the shared expense, owner, transaction, participant, and settlement requests", () => {
    expect(debtInclude).toMatchObject({
      sharedExpense: {
        include: {
          owner: { select: { id: true, name: true, email: true } },
          transaction: { select: publicTransactionSelect }
        }
      },
      user: { select: { id: true, name: true, email: true } },
      settlementRequests: {
        orderBy: { createdAt: "desc" },
        include: {
          debtor: { select: { id: true, name: true, email: true } },
          creditor: { select: { id: true, name: true, email: true } }
        }
      }
    });
  });
});
