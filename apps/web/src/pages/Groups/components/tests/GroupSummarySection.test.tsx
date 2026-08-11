import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { GroupSummarySection } from "../GroupSummarySection";

describe("GroupSummarySection", () => {
  it("renders income, expenses, and a positive balance in the positive color", () => {
    renderWithProviders(
      <GroupSummarySection summary={{ totalIncome: 1000, totalExpenses: 400, balance: 600 }} />
    );

    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("$400.00")).toBeInTheDocument();
    expect(screen.getByText("$600.00")).toHaveClass("text-pine");
  });

  it("renders a negative balance in the negative color", () => {
    renderWithProviders(
      <GroupSummarySection summary={{ totalIncome: 100, totalExpenses: 400, balance: -300 }} />
    );

    expect(screen.getByText("-$300.00")).toHaveClass("text-coral");
  });
});
