import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmRevokeDialog } from "../ConfirmRevokeDialog";

const setup = (props: Partial<Parameters<typeof ConfirmRevokeDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmRevokeDialog
      title={'Revoke "Laptop"?'}
      body="Anything using this key will stop working immediately."
      confirmLabel="Revoke key"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel };
};

describe("ConfirmRevokeDialog", () => {
  it("names the item, labels the dialog by it, and confirms", async () => {
    const { onConfirm } = setup();
    expect(screen.getByRole("dialog", { name: 'Revoke "Laptop"?' })).toBeInTheDocument();
    expect(screen.getByText(/stop working immediately/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Revoke key" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables confirm while pending", () => {
    setup({ pending: true });
    expect(screen.getByRole("button", { name: "Revoke key" })).toBeDisabled();
  });

  it("cancels via Cancel button and Escape", async () => {
    const { onCancel } = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
