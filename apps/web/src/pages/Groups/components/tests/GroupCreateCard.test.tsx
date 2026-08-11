import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { GroupCreateCard } from "../GroupCreateCard";

function baseProps() {
  return {
    isCreateOpen: true,
    onClose: vi.fn(),
    name: "",
    onNameChange: vi.fn(),
    description: "",
    onDescriptionChange: vi.fn(),
    onSubmit: vi.fn(async () => {}),
    isSaving: false
  };
}

describe("GroupCreateCard", () => {
  it("renders nothing when isCreateOpen is false", () => {
    renderWithProviders(<GroupCreateCard {...baseProps()} isCreateOpen={false} />);
    expect(screen.queryByText("New group")).not.toBeInTheDocument();
  });

  it("renders the form when open and calls onClose from Cancel", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<GroupCreateCard {...props} />);

    expect(screen.getByText("New group")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("calls onNameChange/onDescriptionChange when typed into", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<GroupCreateCard {...props} />);

    await user.type(screen.getByLabelText("Name"), "a");
    await user.type(screen.getByLabelText("Description"), "b");

    expect(props.onNameChange).toHaveBeenCalled();
    expect(props.onDescriptionChange).toHaveBeenCalled();
  });

  it("disables the submit button while isSaving", () => {
    renderWithProviders(<GroupCreateCard {...baseProps()} isSaving />);
    expect(screen.getByRole("button", { name: "Save group" })).toBeDisabled();
  });
});
