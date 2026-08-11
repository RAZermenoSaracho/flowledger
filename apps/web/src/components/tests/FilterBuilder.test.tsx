import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { createEmptyGroup, type DomainGroupNode, type SearchFieldConfig } from "../../utils/searchDomain";
import { FilterBuilder } from "../FilterBuilder";

const stringField: SearchFieldConfig = { name: "name", label: "Name", type: "string" };
const numberField: SearchFieldConfig = { name: "amount", label: "Amount", type: "number" };
const dateField: SearchFieldConfig = { name: "date", label: "Date", type: "date" };
const booleanField: SearchFieldConfig = { name: "isArchived", label: "Archived", type: "boolean" };
const enumField: SearchFieldConfig = {
  name: "status",
  label: "Status",
  type: "enum",
  options: [
    { label: "Pending", value: "pending" },
    { label: "Settled", value: "settled" }
  ]
};
const fields = [stringField, numberField, dateField, booleanField, enumField];

function renderBuilder(overrides: Partial<Parameters<typeof FilterBuilder>[0]> = {}) {
  const onClose = vi.fn();
  const onApply = vi.fn();
  const result = renderWithProviders(
    <FilterBuilder
      isOpen
      onClose={onClose}
      fields={fields}
      initialDomain={createEmptyGroup("and")}
      onApply={onApply}
      {...overrides}
    />
  );
  return { onClose, onApply, ...result };
}

describe("FilterBuilder", () => {
  it("renders nothing when isOpen is false", () => {
    renderWithProviders(
      <FilterBuilder
        isOpen={false}
        onClose={vi.fn()}
        fields={fields}
        initialDomain={createEmptyGroup("and")}
        onApply={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog with 'No conditions yet' for an empty root", () => {
    renderBuilder();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByText("No conditions yet.")).toBeInTheDocument();
  });

  it("closes without applying when the X button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose, onApply } = renderBuilder();

    await user.click(screen.getByRole("button", { name: "Close filters" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("closes without applying when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { onClose, onApply } = renderBuilder();

    // eslint-disable-next-line testing-library/no-node-access
    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside the dialog panel itself", async () => {
    const user = userEvent.setup();
    const { onClose } = renderBuilder();

    await user.click(screen.getByRole("heading", { name: "Filters" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds a condition on the alphabetically-first field when '+ Condition' is clicked", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));

    // FilterBuilder sorts fields by label for the picker — "Amount" sorts
    // before "Name"/"Archived"/"Date"/"Status" — and '+ Condition' seeds
    // the new condition from that same sorted list's first entry.
    expect(screen.getByLabelText("Field")).toHaveValue("amount");
    expect(screen.queryByText("No conditions yet.")).not.toBeInTheDocument();
  });

  it("adds a nested group when '+ Group' is clicked, with its own remove button", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Group" }));

    expect(screen.getByRole("button", { name: "Remove group" })).toBeInTheDocument();
  });

  it("changes the root connector between AND/OR", async () => {
    const user = userEvent.setup();
    renderBuilder();

    const matchSelect = screen.getByDisplayValue("all (AND)");
    await user.selectOptions(matchSelect, "or");

    expect(screen.getByDisplayValue("any (OR)")).toBeInTheDocument();
  });

  it("removes a condition via its remove button", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.click(screen.getByRole("button", { name: "Remove condition" }));

    expect(screen.getByText("No conditions yet.")).toBeInTheDocument();
  });

  it("switching the field resets the operator and value to the new field's defaults", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "isArchived");

    expect(screen.getByLabelText("Field")).toHaveValue("isArchived");
    expect(screen.getByLabelText("Operator")).toHaveValue("=");
    expect(screen.getByLabelText("Value")).toHaveValue("true");
  });

  it("hides the value input for isNull/isNotNull operators", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Operator"), "isNull");

    expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();
  });

  it("renders a number input for a number field's scalar operator", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "amount");
    await user.selectOptions(screen.getByLabelText("Operator"), ">");

    expect(screen.getByLabelText("Value")).toHaveAttribute("type", "number");
  });

  it("renders From/To inputs for the 'between' operator", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "amount");
    await user.selectOptions(screen.getByLabelText("Operator"), "between");

    await user.type(screen.getByLabelText("From"), "10");
    await user.type(screen.getByLabelText("To"), "20");

    expect(screen.getByLabelText("From")).toHaveValue(10);
    expect(screen.getByLabelText("To")).toHaveValue(20);
  });

  it("renders a select of options for an enum field's scalar operator", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "status");

    expect(screen.getByRole("option", { name: "Settled" })).toBeInTheDocument();
  });

  it("renders a checklist for in/notIn on an options field", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "status");
    await user.selectOptions(screen.getByLabelText("Operator"), "in");

    const settledCheckbox = screen.getByRole("checkbox", { name: "Settled" });
    await user.click(settledCheckbox);

    expect(settledCheckbox).toBeChecked();
  });

  it("renders a chip-entry MultiValueInput for in/notIn on a non-options field", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "name");
    await user.selectOptions(screen.getByLabelText("Operator"), "in");

    await user.type(screen.getByLabelText("Add value"), "groceries{Enter}");

    expect(screen.getByText("groceries")).toBeInTheDocument();
  });

  it("removes a chip from MultiValueInput", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.selectOptions(screen.getByLabelText("Field"), "name");
    await user.selectOptions(screen.getByLabelText("Operator"), "in");
    await user.type(screen.getByLabelText("Add value"), "groceries{Enter}");

    await user.click(screen.getByRole("button", { name: "Remove groceries" }));

    expect(screen.queryByText("groceries")).not.toBeInTheDocument();
  });

  it("resets to an empty domain when 'Clear conditions' is clicked", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.click(screen.getByRole("button", { name: "Clear conditions" }));

    expect(screen.getByText("No conditions yet.")).toBeInTheDocument();
  });

  it("calls onApply with the draft domain when 'Done' is clicked, not before", async () => {
    const user = userEvent.setup();
    const { onApply } = renderBuilder();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onApply).toHaveBeenCalledOnce();
    const appliedDomain = onApply.mock.calls[0]![0] as DomainGroupNode;
    expect(appliedDomain.children).toHaveLength(1);
  });

  it("reseeds the draft from initialDomain each time it transitions to open", () => {
    const seededDomain: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [
        { type: "condition", id: "c1", fieldName: "name", operator: "=", value: "groceries" }
      ]
    };

    const { rerender } = renderWithProviders(
      <FilterBuilder
        isOpen={false}
        onClose={vi.fn()}
        fields={fields}
        initialDomain={seededDomain}
        onApply={vi.fn()}
      />
    );

    rerender(
      <FilterBuilder
        isOpen
        onClose={vi.fn()}
        fields={fields}
        initialDomain={seededDomain}
        onApply={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Field")).toHaveValue("name");
  });

  it("disables '+ Condition' when there are no fields to condition on", () => {
    renderBuilder({ fields: [] });
    expect(screen.getByRole("button", { name: "+ Condition" })).toBeDisabled();
  });
});
