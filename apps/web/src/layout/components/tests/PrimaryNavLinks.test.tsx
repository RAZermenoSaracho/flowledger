import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { PrimaryNavLinks } from "../PrimaryNavLinks";

const items = [
  ["Dashboard", "/"],
  ["Transactions", "/transactions"]
] as const;

describe("PrimaryNavLinks", () => {
  it("renders a link for each item", () => {
    renderWithProviders(<PrimaryNavLinks items={items} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/transactions"
    );
  });

  it("highlights the link matching the current route as active", () => {
    renderWithProviders(<PrimaryNavLinks items={items} />, { route: "/transactions" });

    expect(screen.getByRole("link", { name: "Transactions" })).toHaveClass("bg-mint");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("bg-mint");
  });

  it("calls onNavigate when a link is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<PrimaryNavLinks items={items} onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Transactions" }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
