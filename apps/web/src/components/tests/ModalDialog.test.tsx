import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalDialog } from "../ModalDialog";

describe("ModalDialog", () => {
  it("opens modally, labels itself by the title, and renders children", () => {
    render(<ModalDialog titleId="t" title="Hello"><p>body</p></ModalDialog>);
    const dialog = screen.getByRole("dialog", { name: "Hello" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("calls onCancel on Escape and prevents native close", () => {
    const onCancel = vi.fn();
    render(<ModalDialog titleId="t" title="Hello" onCancel={onCancel}>x</ModalDialog>);
    const event = new Event("cancel", { cancelable: true });
    fireEvent(screen.getByRole("dialog"), event);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores Escape when no onCancel is given", () => {
    render(<ModalDialog titleId="t" title="Hello">x</ModalDialog>);
    const event = new Event("cancel", { cancelable: true });
    fireEvent(screen.getByRole("dialog"), event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });
});
