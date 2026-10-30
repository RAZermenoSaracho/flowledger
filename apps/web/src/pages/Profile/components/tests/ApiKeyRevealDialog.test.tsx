import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyRevealDialog } from "../ApiKeyRevealDialog";

describe("ApiKeyRevealDialog", () => {
  it("shows the secret and ignores Escape", () => {
    const onClose = vi.fn();
    render(<ApiKeyRevealDialog secret="fl_abc" onClose={onClose} />);

    expect(screen.getByText("fl_abc")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes only via the acknowledge button", async () => {
    const onClose = vi.fn();
    render(<ApiKeyRevealDialog secret="fl_abc" onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "I've saved it" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("copies and announces via aria-live", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    render(<ApiKeyRevealDialog secret="fl_abc" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("fl_abc");
    expect(await screen.findByText("Copied to clipboard")).toHaveAttribute("aria-live", "polite");
  });
});
