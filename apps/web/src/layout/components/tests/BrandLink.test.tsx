import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { BrandLink } from "../BrandLink";

describe("BrandLink", () => {
  it("links to the dashboard route", () => {
    renderWithProviders(<BrandLink />);
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/");
  });

  it("calls onNavigate when clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<BrandLink onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Go to Dashboard" }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
