import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { MobilePrimaryNavLinks } from "../MobilePrimaryNavLinks";

const items = [
  ["Dashboard", "/"],
  ["Debts", "/debts"],
  ["Notification models", "/notification-models"]
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

  it("expands Notification models into My Models and Public Models tab links", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobilePrimaryNavLinks items={items} />);
    await user.click(screen.getByRole("button", { name: "Notification models" }));
    expect(screen.getByRole("link", { name: "My Models" })).toHaveAttribute("href", "/notification-models?tab=my");
    expect(screen.getByRole("link", { name: "Public Models" })).toHaveAttribute("href", "/notification-models?tab=public");
  });
});
