import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangeEmailDialog } from "../ChangeEmailDialog";

const props = { email: "new@example.com", error: null, isPending: false };

describe("ChangeEmailDialog", () => {
  it("names the new email and warns that other devices are signed out", () => {
    render(<ChangeEmailDialog {...props} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(screen.getByText(/other devices will be signed out/)).toBeInTheDocument();
  });

  it("submits the typed password", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ChangeEmailDialog {...props} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("Current password"), "secret");
    await user.click(screen.getByRole("button", { name: "Change email" }));
    expect(onSubmit).toHaveBeenCalledWith("secret");
  });

  it("shows the error and calls onCancel from Cancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ChangeEmailDialog {...props} error="Email already registered" onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Email already registered");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
