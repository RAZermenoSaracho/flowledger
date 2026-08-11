import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { MobileSidebarDrawer } from "../MobileSidebarDrawer";

const items = [["Dashboard", "/"]] as const;

function renderDrawer(overrides: Partial<Parameters<typeof MobileSidebarDrawer>[0]> = {}) {
  const onClose = vi.fn();
  const onLogout = vi.fn();
  const result = renderWithProviders(
    <MobileSidebarDrawer
      isOpen
      items={items}
      onClose={onClose}
      onLogout={onLogout}
      side="left"
      {...overrides}
    />
  );
  return { onClose, onLogout, ...result };
}

describe("MobileSidebarDrawer", () => {
  it("is visually hidden (not removed) when isOpen is false", () => {
    const { container } = renderDrawer({ isOpen: false });
    expect(container.firstChild).toHaveClass("hidden");
  });

  it("shows the dialog when isOpen is true", () => {
    const { container } = renderDrawer();
    expect(container.firstChild).toHaveClass("block");
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
  });

  it("positions itself on the given side", () => {
    const { rerender } = renderDrawer({ side: "left" });
    expect(screen.getByRole("dialog")).toHaveClass("left-0");

    rerender(
      <MobileSidebarDrawer
        isOpen
        items={items}
        onClose={vi.fn()}
        onLogout={vi.fn()}
        side="right"
      />
    );
    expect(screen.getByRole("dialog")).toHaveClass("right-0");
  });

  it("calls onClose from the backdrop button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose from the 'Close' button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onLogout from 'Sign out'", async () => {
    const user = userEvent.setup();
    const { onLogout } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("shows the account link with authUserName, calling onClose (as onNavigate) when clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer({ authUserName: "Jane Doe" });

    const accountLink = screen.getByRole("link", { name: "Jane Doe" });
    expect(accountLink).toHaveAttribute("href", "/profile");

    await user.click(accountLink);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits the account link when authUserName is not given", () => {
    renderDrawer();
    expect(screen.queryByRole("link", { name: /profile/i })).not.toBeInTheDocument();
  });
});
