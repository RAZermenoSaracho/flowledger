import type { HoldingsValuation } from "@flowledger/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HoldingsValueSummary } from "../HoldingsValueSummary";

function valuation(overrides: Partial<HoldingsValuation> = {}): HoldingsValuation {
  return {
    status: "complete",
    currency: "USD",
    value: "1500",
    missingCount: 0,
    holdingCount: 2,
    ...overrides
  };
}

describe("HoldingsValueSummary", () => {
  it("renders only the total value", () => {
    render(<HoldingsValueSummary valuation={valuation()} />);
    expect(screen.getByText("Total value")).toBeInTheDocument();
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
    expect(screen.queryByText("Net deposited")).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial|No holdings/)).not.toBeInTheDocument();
  });

  it("notes the holdings without a value when partial", () => {
    const { rerender } = render(
      <HoldingsValueSummary valuation={valuation({ status: "partial", missingCount: 2 })} />
    );
    expect(screen.getByText(/Partial.*2 holdings without a value/)).toBeInTheDocument();
    rerender(
      <HoldingsValueSummary valuation={valuation({ status: "partial", missingCount: 1 })} />
    );
    expect(screen.getByText(/1 holding without a value/)).toBeInTheDocument();
  });

  it("notes an empty account", () => {
    render(
      <HoldingsValueSummary
        valuation={valuation({ status: "empty", value: "0", holdingCount: 0 })}
      />
    );
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("No holdings yet")).toBeInTheDocument();
  });
});
