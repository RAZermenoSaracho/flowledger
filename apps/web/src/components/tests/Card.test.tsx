import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { Card } from "../Card";

describe("Card", () => {
  it("renders its children", () => {
    renderWithProviders(<Card>content</Card>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("merges a custom className with the base styles", () => {
    renderWithProviders(<Card className="extra-class">content</Card>);
    const card = screen.getByText("content");
    expect(card).toHaveClass("extra-class");
    expect(card).toHaveClass("rounded-lg");
  });

  it("forwards other div props", () => {
    renderWithProviders(<Card data-testid="my-card">content</Card>);
    expect(screen.getByTestId("my-card")).toBeInTheDocument();
  });
});
