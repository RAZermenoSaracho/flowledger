import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UnavailableActionTooltip } from "../UnavailableActionTooltip";

const TEXT = "Bank synchronization is temporarily unavailable.";

function setup(unavailable = true) {
  const onClick = vi.fn();
  render(
    <UnavailableActionTooltip unavailable={unavailable}>
      {(a11y) => (
        <button
          type="button"
          onClick={unavailable ? undefined : onClick}
          {...a11y}
        >
          Go
        </button>
      )}
    </UnavailableActionTooltip>
  );
  return { onClick, button: screen.getByRole("button", { name: "Go" }) };
}

describe("UnavailableActionTooltip", () => {
  it("adds nothing when available", () => {
    const { button } = setup(false);
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("marks the control aria-disabled and shows the tooltip on keyboard focus", async () => {
    const user = userEvent.setup();
    const { button } = setup();
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.tab();

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(TEXT);
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("shows on hover and hides on unhover", async () => {
    const user = userEvent.setup();
    const { button } = setup();
    await user.hover(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.unhover(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toggles on tap", () => {
    const { button } = setup();
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    setup();
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
