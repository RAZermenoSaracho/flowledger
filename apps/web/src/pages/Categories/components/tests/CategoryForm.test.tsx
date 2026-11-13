import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryForm } from "../CategoryForm";

describe("CategoryForm", () => {
  it("submits the entered values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CategoryForm submitLabel="Save" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.selectOptions(screen.getByLabelText("Type"), "income");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Rent", type: "income", color: "#176b52" });
  });

  it("seeds fields from initialValues", () => {
    render(
      <CategoryForm
        submitLabel="Save"
        initialValues={{ name: "Food", type: "expense", color: "#ff0000" }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Food");
    expect(screen.getByLabelText("Color")).toHaveValue("#ff0000");
  });

  it("renders Cancel only when onCancel is given", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<CategoryForm submitLabel="Save" onSubmit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    rerender(<CategoryForm submitLabel="Save" onSubmit={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the rejection message and keeps the values", async () => {
    const user = userEvent.setup();
    render(
      <CategoryForm submitLabel="Save" onSubmit={vi.fn().mockRejectedValue(new Error("Nope"))} />
    );
    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(screen.getByLabelText("Name")).toHaveValue("Rent");
  });

  it("reports dirty state and disables submit while pending", async () => {
    const onDirtyChange = vi.fn();
    const user = userEvent.setup();
    render(<CategoryForm submitLabel="Save" pending onSubmit={vi.fn()} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    await user.type(screen.getByLabelText("Name"), "a");
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
