import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders its children as muted text", () => {
    renderWithProviders(<EmptyState>No results.</EmptyState>);
    expect(screen.getByText("No results.")).toHaveClass("text-slate-500");
  });
});
