import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { CashflowRow } from "../../../../types/reports.types";
import { MonthlyCashflowChart } from "../MonthlyCashflowChart";

describe("MonthlyCashflowChart", () => {
  it("renders the chart heading", () => {
    renderWithProviders(
      <MonthlyCashflowChart rows={[]} currency="USD" reportModeLabel="Net" />
    );
    expect(screen.getByText("Monthly cashflow")).toBeInTheDocument();
  });

  it("renders without crashing given real cashflow rows", () => {
    const rows: CashflowRow[] = [
      {
        month: "2024-01",
        income: 1000,
        expenses: 400,
        grossExpenses: 400,
        expenseReimbursements: 0,
        netExpenses: 400,
        grossIncome: 1000,
        incomeOffsets: 0,
        netIncome: 1000,
        balance: 600,
        reportIncome: 1000,
        reportExpenses: 400
      }
    ];

    renderWithProviders(
      <MonthlyCashflowChart rows={rows} currency="USD" reportModeLabel="Net" />
    );

    expect(screen.getByText("Monthly cashflow")).toBeInTheDocument();
  });
});
