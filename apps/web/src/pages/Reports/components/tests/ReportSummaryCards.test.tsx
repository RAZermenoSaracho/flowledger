import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ReportSummaryCards } from "../ReportSummaryCards";

function baseProps() {
  return {
    currency: "USD",
    totalIncome: 1000,
    totalExpenses: 400,
    reportBalance: 600,
    reportModeLabel: "Net",
    totalGrossIncome: 1000,
    totalGrossExpenses: 400,
    totalExpenseReimbursements: 0
  };
}

describe("ReportSummaryCards", () => {
  it("renders income/expenses/balance amounts", () => {
    renderWithProviders(<ReportSummaryCards {...baseProps()} />);

    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("$400.00")).toBeInTheDocument();
    expect(screen.getByText("$600.00")).toBeInTheDocument();
  });

  it("labels the expenses card with the reportModeLabel", () => {
    renderWithProviders(<ReportSummaryCards {...baseProps()} reportModeLabel="Gross" />);
    expect(screen.getByText("Gross expenses")).toBeInTheDocument();
  });

  it("omits the gross/offset breakdown lines when there are no reimbursements", () => {
    renderWithProviders(<ReportSummaryCards {...baseProps()} />);
    expect(screen.queryByText(/Offset/)).not.toBeInTheDocument();
  });

  it("shows gross/offset breakdown lines when there are reimbursements", () => {
    renderWithProviders(
      <ReportSummaryCards
        {...baseProps()}
        totalExpenseReimbursements={100}
        totalGrossIncome={1100}
        totalGrossExpenses={500}
      />
    );

    expect(screen.getAllByText(/Offset/).length).toBe(2);
  });
});
