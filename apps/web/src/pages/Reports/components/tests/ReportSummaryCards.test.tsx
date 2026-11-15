import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportSummaryCards } from "../ReportSummaryCards";

const credits = { total: "3000", transfers: "2000", payments: "500", refunds: "300", cashback: "200", other: "0" };

function renderCards(mode: "Gross" | "Net", creditCardCredits?: typeof credits) {
  render(
    <ReportSummaryCards
      currency="MXN"
      totalIncome={1000}
      totalExpenses={400}
      reportBalance={600}
      reportModeLabel={mode}
      totalGrossIncome={1000}
      totalGrossExpenses={400}
      totalExpenseReimbursements={0}
      creditCardCredits={creditCardCredits}
    />
  );
}

describe("ReportSummaryCards", () => {
  it.each(["Gross", "Net"] as const)("shows credit card credits separately from income in %s mode", (mode) => {
    renderCards(mode, credits);

    expect(screen.getByText("Credit card credits").parentElement).toHaveTextContent("$3,000.00");
    expect(screen.getByText("Credit card credits").parentElement).toHaveTextContent("Not included in income");
    expect(screen.getByText("Income").parentElement).toHaveTextContent("$1,000.00");
    expect(screen.getByText("Credit card credits").parentElement).toHaveTextContent("Refunds MX$300.00");
  });

  it("hides the credits figure when there are none", () => {
    renderCards("Net", { ...credits, total: "0" });
    expect(screen.queryByText("Credit card credits")).not.toBeInTheDocument();
    renderCards("Net");
    expect(screen.queryByText("Credit card credits")).not.toBeInTheDocument();
  });
});
