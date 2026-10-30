import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateApiKeyForm } from "../CreateApiKeyForm";

describe("CreateApiKeyForm", () => {
  it("defaults to Read and 1 month and submits them", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CreateApiKeyForm onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Read")).toBeChecked();
    expect(screen.getByLabelText("1 month")).toBeChecked();
    await user.type(screen.getByLabelText("Name"), "CLI");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "CLI", allowWrite: false, lifetime: "1m" });
  });

  it("warns when Never is selected", async () => {
    const user = userEvent.setup();
    render(<CreateApiKeyForm onSubmit={vi.fn()} />);

    expect(screen.queryByText(/never expires stays valid/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Never"));
    expect(screen.getByText(/never expires stays valid/)).toBeInTheDocument();
  });

  it("shows the error when submit rejects", async () => {
    const user = userEvent.setup();
    render(<CreateApiKeyForm onSubmit={vi.fn().mockRejectedValue(new Error("Nope"))} />);
    await user.type(screen.getByLabelText("Name"), "CLI");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(screen.getByText("Nope")).toBeInTheDocument());
  });
});
