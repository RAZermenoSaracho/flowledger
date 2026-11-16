import type { HoldingsValuation } from "@flowledger/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HoldingsValueSummary } from "../HoldingsValueSummary";

function valuation(overrides: Partial<HoldingsValuation> = {}): HoldingsValuation {
  return {
    status: "complete",
    currency: "USD",
    value: "1500",
    netDeposited: "1000",
    ...overrides
  } as HoldingsValuation;
}

describe("HoldingsValueSummary", () => {
  it("renders the holdings value and net deposited", () => {
    render(<HoldingsValueSummary valuation={valuation()} />);
    expect(screen.getByText("Holdings value")).toBeInTheDocument();
    expect(screen.getByText("Net deposited")).toBeInTheDocument();
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it("shows Partial only for a partial valuation", () => {
    const { rerender } = render(<HoldingsValueSummary valuation={valuation()} />);
    expect(screen.queryByText("Partial")).not.toBeInTheDocument();
    rerender(<HoldingsValueSummary valuation={valuation({ status: "partial" })} />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
  });
});
