import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { AppSidebar } from "../AppSidebar";

describe("AppSidebar", () => {
  it("renders the brand link and primary nav", () => {
    renderWithProviders(<AppSidebar onLogout={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Transactions" })).toBeInTheDocument();
  });

  it("shows the account link with the user's name when authUserName is given", () => {
    renderWithProviders(<AppSidebar authUserName="Jane Doe" onLogout={vi.fn()} />);

    const accountLink = screen.getByRole("link", { name: /Account.*Jane Doe/s });
    expect(accountLink).toHaveAttribute("href", "/profile");
  });

  it("omits the account link when no authUserName is given", () => {
    renderWithProviders(<AppSidebar onLogout={vi.fn()} />);
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
  });

  it("calls onLogout when 'Sign out' is clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderWithProviders(<AppSidebar onLogout={onLogout} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onLogout).toHaveBeenCalledOnce();
  });
});
