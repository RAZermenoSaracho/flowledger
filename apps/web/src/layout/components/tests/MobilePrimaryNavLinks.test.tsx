import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { MobilePrimaryNavLinks } from "../MobilePrimaryNavLinks";

const items = [
  ["Dashboard", "/"],
  ["Debts", "/debts"]
] as const;

describe("MobilePrimaryNavLinks", () => {
  it("renders a plain link for an item with no expandable config", () => {
    renderWithProviders(<MobilePrimaryNavLinks items={items} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
  });

  it("renders an expandable item as a toggle button instead of a plain link, per the real mobileExpandableNav config", () => {
    renderWithProviders(<MobilePrimaryNavLinks items={items} />);

    expect(screen.queryByRole("link", { name: "Debts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Debts" })).toBeInTheDocument();
  });
});
