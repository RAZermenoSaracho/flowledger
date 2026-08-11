import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { SelectField, TextArea, TextInput } from "../FormField";

describe("TextInput", () => {
  it("associates the label with the input via the wrapping <label>", () => {
    renderWithProviders(<TextInput label="Name" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("forwards input props and calls onChange when typed into", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<TextInput label="Name" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("Name"), "a");

    expect(onChange).toHaveBeenCalled();
  });

  it("merges a custom className with the base styles", () => {
    renderWithProviders(
      <TextInput label="Name" value="" onChange={vi.fn()} className="extra-class" />
    );
    expect(screen.getByLabelText("Name")).toHaveClass("extra-class", "rounded-md");
  });
});

describe("SelectField", () => {
  it("associates the label with the select and renders its options", () => {
    renderWithProviders(
      <SelectField label="Type" value="expense" onChange={vi.fn()}>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </SelectField>
    );

    const select = screen.getByLabelText("Type");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Income" })).toBeInTheDocument();
  });

  it("calls onChange when a different option is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <SelectField label="Type" value="expense" onChange={onChange}>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </SelectField>
    );

    await user.selectOptions(screen.getByLabelText("Type"), "income");

    expect(onChange).toHaveBeenCalled();
  });
});

describe("TextArea", () => {
  it("associates the label with the textarea", () => {
    renderWithProviders(<TextArea label="Notes" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("forwards textarea props and calls onChange when typed into", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<TextArea label="Notes" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("Notes"), "a");

    expect(onChange).toHaveBeenCalled();
  });
});
