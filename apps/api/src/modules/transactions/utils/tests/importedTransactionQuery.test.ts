import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  importedTransactionSearchWhere,
  importedTransactionType,
  importValidationError,
  resolveImportedTransactionIds,
  resolveImportedTransactionSelectionIds
} from "../importedTransactionQuery.js";

describe("importedTransactionSearchWhere", () => {
  it("builds a text OR-clause across description/provider/category/account fields", () => {
    const where = importedTransactionSearchWhere("coffee");
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { description: { contains: "coffee", mode: "insensitive" } },
        { provider: { contains: "coffee", mode: "insensitive" } }
      ])
    );
  });

  it("adds an exact-amount filter when the search term parses as a number", () => {
    const where = importedTransactionSearchWhere("42.50");
    expect(where.OR).toEqual(
      expect.arrayContaining([{ amount: new Prisma.Decimal("42.50") }])
    );
  });

  it("does not add an amount filter for a non-numeric search term", () => {
    const where = importedTransactionSearchWhere("coffee");
    expect(where.OR?.some((clause) => "amount" in clause)).toBe(false);
  });

  it("adds a same-day transactionDate range when the term looks like a date", () => {
    const where = importedTransactionSearchWhere("2024-03-15");
    const dateClause = where.OR?.find(
      (clause) => "transactionDate" in clause
    ) as { transactionDate: { gte: Date; lt: Date } } | undefined;

    expect(dateClause).toBeDefined();
    expect(dateClause?.transactionDate.gte.toISOString().slice(0, 10)).toBe(
      "2024-03-15"
    );
    expect(dateClause?.transactionDate.lt.toISOString().slice(0, 10)).toBe(
      "2024-03-16"
    );
  });

  it("does not add a date filter for a term that doesn't look like a date", () => {
    const where = importedTransactionSearchWhere("coffee");
    expect(where.OR?.some((clause) => "transactionDate" in clause)).toBe(
      false
    );
  });
});

describe("importedTransactionType", () => {
  it("returns 'expense' for a negative amount", () => {
    expect(importedTransactionType(new Prisma.Decimal("-10"))).toBe(
      "expense"
    );
  });

  it("returns 'income' for a positive amount", () => {
    expect(importedTransactionType(new Prisma.Decimal("10"))).toBe("income");
  });

  it("throws a 400 HttpError for a zero amount", () => {
    expect(() => importedTransactionType(new Prisma.Decimal("0"))).toThrow(
      "Imported transactions with a zero amount cannot be imported"
    );
  });
});

describe("importValidationError", () => {
  it("pairs an id with a message", () => {
    expect(importValidationError("it-1", "Missing category")).toEqual({
      id: "it-1",
      message: "Missing category"
    });
  });
});

describe("resolveImportedTransactionIds", () => {
  beforeEach(() => {
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);
  });

  it("resolves ids scoped to the user when rawWhere is undefined", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" },
      { id: "it-2" }
    ] as never);

    const ids = await resolveImportedTransactionIds("user-1", undefined);

    expect(ids).toEqual(["it-1", "it-2"]);
  });

  it("expands 'and'/'or'/'not' nodes without throwing and still resolves ids", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" }
    ] as never);

    const ids = await resolveImportedTransactionIds("user-1", {
      and: [
        { or: [{ field: "status", op: "=", value: "pending" }] },
        { not: { field: "status", op: "=", value: "ignored" } }
      ]
    });

    expect(ids).toEqual(["it-1"]);
  });

  it("resolves the virtual 'search' field into an id-in condition via a lookup query, caching repeated terms", async () => {
    prismaMock.providerImportedTransaction.findMany
      .mockResolvedValueOnce([{ id: "matched-1" }] as never) // search lookup
      .mockResolvedValueOnce([{ id: "matched-1" }] as never); // sieve hydration

    const ids = await resolveImportedTransactionIds("user-1", {
      or: [
        { field: "search", op: "contains", value: "coffee" },
        { field: "search", op: "contains", value: "coffee" }
      ]
    });

    expect(ids).toEqual(["matched-1"]);
    // Only one lookup query for the search term despite it appearing twice,
    // plus the sieve's own hydration call — two findMany calls total.
    expect(prismaMock.providerImportedTransaction.findMany).toHaveBeenCalledTimes(2);
  });

  it("treats a blank search term as no condition, skipping the lookup query", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" }
    ] as never);

    await resolveImportedTransactionIds("user-1", {
      field: "search",
      op: "contains",
      value: "   "
    });

    // Only the sieve's own hydration call — no search lookup query fired.
    expect(prismaMock.providerImportedTransaction.findMany).toHaveBeenCalledTimes(1);
  });

  it("drops a 'not' node whose inner condition expands to nothing", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" }
    ] as never);

    const ids = await resolveImportedTransactionIds("user-1", {
      not: { field: "search", op: "contains", value: "" }
    });

    expect(ids).toEqual(["it-1"]);
    // No search lookup fired — only the sieve's own hydration call.
    expect(prismaMock.providerImportedTransaction.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("resolveImportedTransactionSelectionIds — 'filtered' mode", () => {
  it("delegates to resolveImportedTransactionIds using the selection's where", async () => {
    prismaMock.providerImportedTransaction.count.mockResolvedValue(0);
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" },
      { id: "it-2" }
    ] as never);

    const ids = await resolveImportedTransactionSelectionIds("user-1", {
      mode: "filtered",
      where: { field: "status", op: "=", value: "pending" }
    });

    expect(ids).toEqual(["it-1", "it-2"]);
  });
});

describe("resolveImportedTransactionSelectionIds — 'ids' mode", () => {
  it("re-verifies ownership against the DB and dedupes the id list", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" },
      { id: "it-2" }
    ] as never);

    const ids = await resolveImportedTransactionSelectionIds("user-1", {
      mode: "ids",
      ids: ["it-1", "it-2", "it-1"]
    });

    expect(prismaMock.providerImportedTransaction.findMany).toHaveBeenCalledWith(
      {
        where: { userId: "user-1", id: { in: ["it-1", "it-2"] } },
        select: { id: true }
      }
    );
    expect(ids).toEqual(["it-1", "it-2"]);
  });

  it("silently drops ids that don't belong to the user", async () => {
    prismaMock.providerImportedTransaction.findMany.mockResolvedValue([
      { id: "it-1" }
    ] as never);

    const ids = await resolveImportedTransactionSelectionIds("user-1", {
      mode: "ids",
      ids: ["it-1", "not-mine"]
    });

    expect(ids).toEqual(["it-1"]);
  });
});
