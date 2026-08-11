import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { MobileBottomNav } from "../MobileBottomNav";

describe("MobileBottomNav", () => {
  it("renders Dashboard/Profile links and the drawer toggle button", () => {
    renderWithProviders(
      <MobileBottomNav isDrawerOpen={false} onNavigate={vi.fn()} onToggleDrawer={vi.fn()} />
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
  });

  it("labels the toggle button as closing the menu once the drawer is open", () => {
    renderWithProviders(
      <MobileBottomNav isDrawerOpen onNavigate={vi.fn()} onToggleDrawer={vi.fn()} />
    );

    const toggle = screen.getByRole("button", { name: "Close navigation menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onNavigate when a link is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(
      <MobileBottomNav isDrawerOpen={false} onNavigate={onNavigate} onToggleDrawer={vi.fn()} />
    );

    await user.click(screen.getByRole("link", { name: "Profile" }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("calls onToggleDrawer when the toggle button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleDrawer = vi.fn();
    renderWithProviders(
      <MobileBottomNav isDrawerOpen={false} onNavigate={vi.fn()} onToggleDrawer={onToggleDrawer} />
    );

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    expect(onToggleDrawer).toHaveBeenCalledOnce();
  });

  it("highlights the active route's link", () => {
    renderWithProviders(
      <MobileBottomNav isDrawerOpen={false} onNavigate={vi.fn()} onToggleDrawer={vi.fn()} />,
      { route: "/profile" }
    );

    expect(screen.getByRole("link", { name: "Profile" })).toHaveClass("bg-mint");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("bg-mint");
  });
});
