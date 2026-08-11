import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { CategoryChartRow } from "../../../../types/reports.types";
import { CategoryBreakdown } from "../CategoryBreakdown";

function makeRow(overrides: Partial<CategoryChartRow> = {}): CategoryChartRow {
  return {
    categoryId: "cat-1",
    categoryName: "Groceries",
    categoryType: "expense",
    type: "expense",
    total: 300,
    grossIncomeTotal: 0,
    incomeOffsetTotal: 0,
    netIncomeTotal: 0,
    grossExpenseTotal: 300,
    reimbursementTotal: 0,
    netExpenseTotal: 300,
    displayName: "Groceries",
    displayTotal: 300,
    chartTotal: 300,
    fill: "#176b52",
    ...overrides
  };
}

describe("CategoryBreakdown", () => {
  it("shows the empty state when there are no rows", () => {
    renderWithProviders(
      <CategoryBreakdown
        title="Expenses"
        rows={[]}
        emptyText="No expense categories yet."
        type="expense"
        currency="USD"
      />
    );

    expect(screen.getByText("No expense categories yet.")).toBeInTheDocument();
  });

  it("renders the title and total amount", () => {
    renderWithProviders(
      <CategoryBreakdown
        title="Expenses"
        rows={[makeRow()]}
        emptyText="No expense categories yet."
        type="expense"
        currency="USD"
      />
    );

    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getAllByText("$300.00").length).toBe(2);
  });

  it("renders a legend entry per row with name and amount", () => {
    renderWithProviders(
      <CategoryBreakdown
        title="Expenses"
        rows={[makeRow(), makeRow({ categoryId: "cat-2", displayName: "Rent", displayTotal: 500 })]}
        emptyText="No expense categories yet."
        type="expense"
        currency="USD"
      />
    );

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("shows gross/offset/net breakdown for an expense row with a reimbursement", () => {
    renderWithProviders(
      <CategoryBreakdown
        title="Expenses"
        rows={[
          makeRow({
            grossExpenseTotal: 400,
            reimbursementTotal: 100,
            netExpenseTotal: 300,
            displayTotal: 300
          })
        ]}
        emptyText="No expense categories yet."
        type="expense"
        currency="USD"
      />
    );

    expect(screen.getByText(/Gross \$400\.00 \| Offset -\$100\.00 \| Net \$300\.00/)).toBeInTheDocument();
  });

  it("shows gross/offset/net breakdown for an income row with an offset", () => {
    renderWithProviders(
      <CategoryBreakdown
        title="Income"
        rows={[
          makeRow({
            type: "income",
            grossIncomeTotal: 1200,
            incomeOffsetTotal: 200,
            netIncomeTotal: 1000,
            displayTotal: 1000
          })
        ]}
        emptyText="No income categories yet."
        type="income"
        currency="USD"
      />
    );

    expect(
      screen.getByText(/Gross \$1,200\.00 \| Offset -\$200\.00 \| Net \$1,000\.00/)
    ).toBeInTheDocument();
  });
});
