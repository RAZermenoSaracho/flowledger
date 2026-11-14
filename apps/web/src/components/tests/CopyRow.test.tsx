import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyRow } from "../CopyRow";

describe("CopyRow", () => {
  it("shows the label, the value and a named copy button", () => {
    render(<CopyRow label="Endpoint" value="https://x/y" copyLabel="Copy endpoint" />);
    expect(screen.getByText("Endpoint")).toBeInTheDocument();
    expect(screen.getByText("https://x/y")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy endpoint" })).toBeInTheDocument();
  });
});
