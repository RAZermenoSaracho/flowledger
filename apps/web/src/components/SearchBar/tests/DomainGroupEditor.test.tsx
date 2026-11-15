import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  addChild,
  createCondition,
  createConditionWithValue,
  createEmptyGroup,
  type DomainGroupNode,
  type SearchFieldConfig
} from "../../../utils/searchDomain";
import { DomainGroupEditor } from "../DomainGroupEditor";

const fields: SearchFieldConfig[] = [
  { name: "name", label: "Name", type: "string" },
  { name: "amount", label: "Amount", type: "number" }
];

function setup(root: DomainGroupNode) {
  const onRootChange = vi.fn();
  render(
    <DomainGroupEditor
      root={root}
      node={root}
      fields={fields}
      onRootChange={onRootChange}
      isRoot
    />
  );
  return onRootChange;
}

function rootWithCondition() {
  const root = createEmptyGroup("and");
  return addChild(root, root.id, createCondition(fields[0]!));
}

describe("DomainGroupEditor", () => {
  it("shows an empty state when the group has no conditions", () => {
    setup(createEmptyGroup("and"));
    expect(screen.getByText("No conditions yet.")).toBeInTheDocument();
  });

  it("renders an existing condition", () => {
    setup(rootWithCondition());
    expect(screen.getByLabelText("Field")).toHaveValue("name");
    expect(screen.getByLabelText("Value")).toBeInTheDocument();
  });

  it("adds a condition on the first field", async () => {
    const onRootChange = setup(createEmptyGroup("and"));
    await userEvent.click(screen.getByRole("button", { name: "+ Condition" }));
    const next = onRootChange.mock.calls[0]![0] as DomainGroupNode;
    expect(next.children).toHaveLength(1);
    expect(next.children[0]).toMatchObject({ fieldName: "name" });
  });

  it("removes a condition", async () => {
    const onRootChange = setup(rootWithCondition());
    await userEvent.click(
      screen.getByRole("button", { name: "Remove condition" })
    );
    expect(onRootChange.mock.calls[0]![0].children).toHaveLength(0);
  });

  it("reports operator and value changes", async () => {
    const onRootChange = setup(rootWithCondition());
    await userEvent.selectOptions(screen.getByLabelText("Operator"), "!=");
    expect(onRootChange.mock.calls[0]![0].children[0].operator).toBe("!=");

    await userEvent.type(screen.getByLabelText("Value"), "x");
    expect(onRootChange.mock.calls.at(-1)![0].children[0].value).toBe("x");
  });

  describe("non-pickable fields", () => {
    const periodField: SearchFieldConfig = {
      name: "period",
      label: "Billing period",
      type: "date",
      ops: ["between"],
      pickable: false,
      describe: () => "Sep 1 – Sep 30"
    };

    function setupWithPeriod() {
      let root = createEmptyGroup("and");
      root = addChild(
        root,
        root.id,
        createConditionWithValue("period", "between", ["a", "b"])
      );
      root = addChild(root, root.id, createCondition(fields[0]!));
      const onRootChange = vi.fn();
      render(
        <DomainGroupEditor
          root={root}
          node={root}
          fields={[periodField, ...fields]}
          onRootChange={onRootChange}
          isRoot
        />
      );
      return onRootChange;
    }

    it("renders read-only summary text and a remove button, without pickers", () => {
      setupWithPeriod();
      expect(
        screen.getByText("Billing period Sep 1 – Sep 30")
      ).toBeInTheDocument();
      expect(screen.getAllByLabelText("Field")).toHaveLength(1);
      expect(
        screen.getAllByRole("button", { name: "Remove condition" })
      ).toHaveLength(2);
    });

    it("removes the read-only condition", async () => {
      const onRootChange = setupWithPeriod();
      await userEvent.click(
        screen.getAllByRole("button", { name: "Remove condition" })[0]!
      );
      const next = onRootChange.mock.calls[0]![0] as DomainGroupNode;
      expect(next.children).toHaveLength(1);
      expect(next.children[0]).toMatchObject({ fieldName: "name" });
    });

    it("excludes it from the field picker and from + Condition", async () => {
      const onRootChange = setupWithPeriod();
      const options = Array.from(
        screen.getByLabelText("Field").querySelectorAll("option")
      ).map((o) => o.textContent);
      expect(options).toEqual(["Name", "Amount"]);
      await userEvent.click(
        screen.getByRole("button", { name: "+ Condition" })
      );
      expect(onRootChange.mock.calls[0]![0].children.at(-1)).toMatchObject({
        fieldName: "name"
      });
    });
  });
});
