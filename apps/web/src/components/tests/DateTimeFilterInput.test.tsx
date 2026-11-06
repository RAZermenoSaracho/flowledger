import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateTimeFilterInput } from "../DateTimeFilterInput";

function setup(value: string) {
  const onChange = vi.fn();
  render(<DateTimeFilterInput label="From" value={value} onChange={onChange} />);
  return onChange;
}

describe("DateTimeFilterInput", () => {
  it("labels both inputs and disables the time field until a date is set", () => {
    setup("");
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("From time")).toBeDisabled();
  });

  it("emits a bare date when only the date is chosen", async () => {
    const onChange = setup("");
    await userEvent.type(screen.getByLabelText("From"), "2026-11-05");
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05");
  });

  it("emits YYYY-MM-DDTHH:mm when a time is added", () => {
    const onChange = setup("2026-11-05");
    const time = screen.getByLabelText("From time");
    expect(time).toBeEnabled();
    fireEvent.change(time, { target: { value: "14:30" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05T14:30");
  });

  it("returns the bare date when the time is cleared", async () => {
    const onChange = setup("2026-11-05T14:30");
    await userEvent.clear(screen.getByLabelText("From time"));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05");
  });

  it("keeps the time when the date changes", () => {
    const onChange = setup("2026-11-05T14:30");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-06" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-11-06T14:30");
  });

  it("wraps date and time by container width using per-field minimum widths", () => {
    setup("2026-11-05");
    const dateWrap = screen.getByLabelText("From").parentElement!.parentElement!;
    const timeWrap = screen.getByLabelText("From time").parentElement!.parentElement!;
    expect(dateWrap.parentElement).toHaveClass("flex", "flex-wrap");
    expect(dateWrap).toHaveClass("min-w-[11rem]");
    expect(timeWrap).toHaveClass("min-w-[7rem]");
  });
});
