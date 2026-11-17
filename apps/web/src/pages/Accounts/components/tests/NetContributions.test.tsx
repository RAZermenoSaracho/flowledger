import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetContributions } from "../NetContributions";

const base = {
  currency: "USD",
  incoming: "1500",
  outgoing: "300",
  net: "1200",
  transferCount: 3,
  excludedCount: 0
};

describe("NetContributions", () => {
  it("shows the net with the in/out split and no excluded note", () => {
    render(<NetContributions contributions={base} />);
    expect(screen.getByText(/Net contributions:/).closest("p")).toHaveTextContent(
      "Net contributions: $1,200.00"
    );
    expect(
      screen.getByText("Transfers in $1,500.00 · out $300.00")
    ).toBeInTheDocument();
    expect(screen.queryByText(/not included/)).not.toBeInTheDocument();
  });

  it("notes excluded transfers, singular and plural", () => {
    const { rerender } = render(
      <NetContributions contributions={{ ...base, excludedCount: 1 }} />
    );
    expect(
      screen.getByText("1 transfer without a recorded amount is not included")
    ).toBeInTheDocument();
    rerender(
      <NetContributions contributions={{ ...base, excludedCount: 4 }} />
    );
    expect(
      screen.getByText("4 transfers without a recorded amount are not included")
    ).toBeInTheDocument();
  });
});
