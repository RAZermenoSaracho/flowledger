import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunStatusBadge } from "../RunStatusBadge";

describe("RunStatusBadge", () => {
  it("labels each status", () => {
    const { rerender } = render(<RunStatusBadge status="skipped" />);
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    rerender(<RunStatusBadge status={null} />);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });
});
