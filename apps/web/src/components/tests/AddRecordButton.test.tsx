import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { AddRecordButton } from "../AddRecordButton";

describe("AddRecordButton", () => {
  it("renders both the desktop labeled button and the mobile icon-only button", () => {
    renderWithProviders(<AddRecordButton label="Transaction" onClick={vi.fn()} />);

    const buttons = screen.getAllByRole("button", { name: "Add Transaction" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("Add Transaction");
  });

  it("calls onClick when either rendered button is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(<AddRecordButton label="Transaction" onClick={onClick} />);

    const buttons = screen.getAllByRole("button", { name: "Add Transaction" });
    expect(buttons).toHaveLength(2);

    for (const button of buttons) {
      await user.click(button);
    }

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
