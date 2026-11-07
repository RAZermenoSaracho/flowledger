import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateTimeFilterInput } from "../DateTimeFilterInput";

function setup(value: string, defaultTime?: "00:00" | "23:59") {
  const onChange = vi.fn();
  render(
    <DateTimeFilterInput
      label="From"
      value={value}
      onChange={onChange}
      defaultTime={defaultTime}
    />
  );
  return onChange;
}

describe("DateTimeFilterInput", () => {
  it("is a date field with the time option off for an empty or bare-date value", () => {
    setup("2026-11-05");
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("From specific time")).not.toBeChecked();
  });

  it("emits a bare date when only a date is chosen", () => {
    const onChange = setup("");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-05" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05");
  });

  it("renders a single datetime-local field for a timed value", () => {
    setup("2026-11-05T14:30");
    const input = screen.getByLabelText("From");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).toHaveValue("2026-11-05T14:30");
    expect(screen.getByLabelText("From specific time")).toBeChecked();
  });

  it("seeds 00:00 by default and 23:59 for upper bounds only when the time option is turned on", async () => {
    const lower = setup("2026-11-05");
    await userEvent.click(screen.getByLabelText("From specific time"));
    expect(lower).toHaveBeenLastCalledWith("2026-11-05T00:00");
  });

  it("seeds 23:59 for an upper bound", async () => {
    const upper = setup("2026-11-05", "23:59");
    await userEvent.click(screen.getByLabelText("From specific time"));
    expect(upper).toHaveBeenLastCalledWith("2026-11-05T23:59");
  });

  it("does not emit anything when the time option is turned on with no date", async () => {
    const onChange = setup("");
    await userEvent.click(screen.getByLabelText("From specific time"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("From")).toHaveAttribute("type", "datetime-local");
  });

  it("returns to the bare date when the time option is turned off", async () => {
    const onChange = setup("2026-11-05T14:30");
    await userEvent.click(screen.getByLabelText("From specific time"));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05");
  });

  it("never emits anything on focus or tabbing through", async () => {
    const onChange = setup("");
    await userEvent.tab();
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("flags a partly filled field on blur, and clears the flag once it is cleared", () => {
    setup("");
    const input = screen.getByLabelText("From");
    Object.defineProperty(input, "validity", {
      configurable: true,
      value: { badInput: true }
    });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Incomplete or invalid, not applied");
    Object.defineProperty(input, "validity", {
      configurable: true,
      value: { badInput: false }
    });
    fireEvent.blur(input);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("emits an empty value and flags it when typing leaves the field incomplete", () => {
    const onChange = setup("2026-11-05T14:30");
    const input = screen.getByLabelText("From");
    Object.defineProperty(input, "validity", {
      configurable: true,
      value: { badInput: true }
    });
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("treats a keystroke-intermediate five-digit year as unusable instead of passing it on", () => {
    const onChange = setup("");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "20261-05-12" } });
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
