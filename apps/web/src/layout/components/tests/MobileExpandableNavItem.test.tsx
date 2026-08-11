import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import type { MobileExpandableNavConfig } from "../../types/appLayout.types";
import { MobileExpandableNavItem } from "../MobileExpandableNavItem";

const config: MobileExpandableNavConfig = {
  basePath: "/debts",
  defaultTab: "balances",
  subPages: [
    { tab: "balances", label: "Outstanding Balances" },
    { tab: "pending", label: "Pending Settlement Requests" }
  ]
};

describe("MobileExpandableNavItem", () => {
  it("starts collapsed when not on the item's base route", () => {
    renderWithProviders(<MobileExpandableNavItem label="Debts" config={config} />, {
      route: "/"
    });

    expect(screen.getByRole("button", { name: "Debts" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("Outstanding Balances")).not.toBeInTheDocument();
  });

  it("starts expanded when already on the item's base route", () => {
    renderWithProviders(<MobileExpandableNavItem label="Debts" config={config} />, {
      route: "/debts"
    });

    expect(screen.getByRole("button", { name: "Debts" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Outstanding Balances")).toBeInTheDocument();
  });

  it("toggles expansion when the button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileExpandableNavItem label="Debts" config={config} />, {
      route: "/"
    });

    await user.click(screen.getByRole("button", { name: "Debts" }));
    expect(screen.getByText("Outstanding Balances")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Debts" }));
    expect(screen.queryByText("Outstanding Balances")).not.toBeInTheDocument();
  });

  it("highlights the sub-page matching the current ?tab=, defaulting to defaultTab", () => {
    renderWithProviders(<MobileExpandableNavItem label="Debts" config={config} />, {
      route: "/debts"
    });

    expect(screen.getByRole("link", { name: "Outstanding Balances" })).toHaveClass("bg-mint");
    expect(screen.getByRole("link", { name: "Pending Settlement Requests" })).not.toHaveClass(
      "bg-mint"
    );
  });

  it("highlights the sub-page matching an explicit ?tab= query param", () => {
    renderWithProviders(<MobileExpandableNavItem label="Debts" config={config} />, {
      route: "/debts?tab=pending"
    });

    expect(screen.getByRole("link", { name: "Pending Settlement Requests" })).toHaveClass(
      "bg-mint"
    );
  });

  it("calls onNavigate when a sub-page link is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(
      <MobileExpandableNavItem label="Debts" config={config} onNavigate={onNavigate} />,
      { route: "/debts" }
    );

    await user.click(screen.getByRole("link", { name: "Outstanding Balances" }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
