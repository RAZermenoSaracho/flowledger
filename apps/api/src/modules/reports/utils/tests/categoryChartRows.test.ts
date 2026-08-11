import { describe, expect, it } from "vitest";
import { prepareCategoryChartRows } from "../categoryChartRows.js";

function row(overrides: Record<string, unknown>) {
  return {
    categoryId: "cat-1",
    categoryName: "Food",
    categoryType: "expense",
    categoryColor: null,
    type: "expense",
    total: 0,
    grossExpenseTotal: 0,
    reimbursementTotal: 0,
    grossIncomeTotal: 0,
    netIncomeTotal: 0,
    ...overrides
  };
}

describe("prepareCategoryChartRows — expense, net mode", () => {
  it("includes a row with a positive net total (grossExpenseTotal or reimbursementTotal)", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 100, total: 80 })] as never,
      "expense",
      "net"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayTotal).toBe(80);
  });

  it("excludes an expense row with zero gross and zero reimbursement", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 0, reimbursementTotal: 0 })] as never,
      "expense",
      "net"
    );
    expect(rows).toHaveLength(0);
  });

  it("includes a fully-reimbursed row (0 gross expense, positive reimbursement) in net mode", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 0, reimbursementTotal: 50, total: -50 })] as never,
      "expense",
      "net"
    );
    expect(rows).toHaveLength(1);
  });

  it("floors chartTotal at 0 for a negative net expense total (over-reimbursed)", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 0, reimbursementTotal: 50, total: -50 })] as never,
      "expense",
      "net"
    );
    expect(rows[0]?.chartTotal).toBe(0);
  });
});

describe("prepareCategoryChartRows — expense, gross mode", () => {
  it("excludes a fully-reimbursed row in gross mode (only gross > 0 counts)", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 0, reimbursementTotal: 50 })] as never,
      "expense",
      "gross"
    );
    expect(rows).toHaveLength(0);
  });

  it("uses grossExpenseTotal as displayTotal", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 200, total: 150 })] as never,
      "expense",
      "gross"
    );
    expect(rows[0]?.displayTotal).toBe(200);
  });
});

describe("prepareCategoryChartRows — income", () => {
  it("filters by netIncomeTotal > 0 in net mode", () => {
    const rows = prepareCategoryChartRows(
      [row({ type: "income", categoryType: "income", netIncomeTotal: 0 })] as never,
      "income",
      "net"
    );
    expect(rows).toHaveLength(0);
  });

  it("filters by grossIncomeTotal > 0 in gross mode", () => {
    const rows = prepareCategoryChartRows(
      [
        row({
          type: "income",
          categoryType: "income",
          grossIncomeTotal: 100,
          netIncomeTotal: 0
        })
      ] as never,
      "income",
      "gross"
    );
    expect(rows).toHaveLength(1);
  });
});

describe("prepareCategoryChartRows — display formatting", () => {
  it("appends the mismatch label when categoryType differs from the report type", () => {
    const rows = prepareCategoryChartRows(
      [
        row({
          type: "expense",
          categoryType: "income",
          grossExpenseTotal: 10,
          total: 10
        })
      ] as never,
      "expense",
      "net"
    );
    expect(rows[0]?.displayName).toBe("Food (income category)");
  });

  it("uses the plain category name when types match", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 10, total: 10 })] as never,
      "expense",
      "net"
    );
    expect(rows[0]?.displayName).toBe("Food");
  });

  it("uses the category's own color when set", () => {
    const rows = prepareCategoryChartRows(
      [row({ categoryColor: "#123456", grossExpenseTotal: 10, total: 10 })] as never,
      "expense",
      "net"
    );
    expect(rows[0]?.fill).toBe("#123456");
  });

  it("falls back to a palette color by index when no category color is set", () => {
    const rows = prepareCategoryChartRows(
      [row({ grossExpenseTotal: 10, total: 10 })] as never,
      "expense",
      "net"
    );
    expect(rows[0]?.fill).toBe("#176b52");
  });

  it("sorts rows descending by displayTotal", () => {
    const rows = prepareCategoryChartRows(
      [
        row({ categoryId: "small", grossExpenseTotal: 10, total: 10 }),
        row({ categoryId: "big", grossExpenseTotal: 100, total: 100 })
      ] as never,
      "expense",
      "net"
    );
    expect(rows.map((r) => r.categoryId)).toEqual(["big", "small"]);
  });
});
