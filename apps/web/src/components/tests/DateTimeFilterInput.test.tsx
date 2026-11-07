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
  it("is always one datetime-local field, with no 'Specific time' toggle", () => {
    setup("");
    expect(screen.getByLabelText("From")).toHaveAttribute(
      "type",
      "datetime-local"
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/specific time/i)).not.toBeInTheDocument();
  });

  it("renders a timed value as is", () => {
    setup("2026-11-05T14:30");
    expect(screen.getByLabelText("From")).toHaveValue("2026-11-05T14:30");
  });

  it("displays a bare date at the default time without emitting", () => {
    const lower = setup("2026-11-05");
    expect(screen.getByLabelText("From")).toHaveValue("2026-11-05T00:00");
    expect(lower).not.toHaveBeenCalled();
  });

  it("displays a bare date at 23:59 for an upper bound", () => {
    setup("2026-11-05", "23:59");
    expect(screen.getByLabelText("From")).toHaveValue("2026-11-05T23:59");
  });

  it("shows a draft of today at the default time on focus, emits nothing, and clears it on blur", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 6, 15, 42) });
    try {
      const onChange = setup("", "23:59");
      const input = screen.getByLabelText("From");
      expect(input).toHaveValue("");
      await userEvent.tab();
      expect(input).toHaveValue("2026-11-06T23:59");
      await userEvent.tab();
      expect(input).toHaveValue("");
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["lower", undefined, "2026-11-05T00:00"],
    ["upper", "23:59" as const, "2026-11-05T23:59"]
  ])(
    "emits the chosen date plus the default time after focus for a %s bound",
    async (_name, defaultTime, expected) => {
      const onChange = setup("", defaultTime);
      await userEvent.tab();
      fireEvent.change(screen.getByLabelText("From"), {
        target: { value: expected }
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(expected);
    }
  );

  it("keeps a time the user chose", () => {
    const onChange = setup("2026-11-05T00:00");
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-11-05T14:30" }
    });
    expect(onChange).toHaveBeenLastCalledWith("2026-11-05T14:30");
  });

  it("emits an empty value when the control is cleared", () => {
    const onChange = setup("2026-11-05T14:30");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incomplete or invalid, not applied"
    );
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
    const input = screen.getByLabelText("From");
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => "20261-05-12"
    });
    fireEvent.input(input);
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
