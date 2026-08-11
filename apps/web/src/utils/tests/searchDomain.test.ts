import { describe, expect, it } from "vitest";
import {
  addChild,
  conditionValueText,
  countConditions,
  createCondition,
  createConditionWithValue,
  createEmptyGroup,
  defaultValueForField,
  domainToSummaryText,
  domainToWhere,
  isValueComplete,
  matchesWhere,
  operatorsForField,
  removeNode,
  updateNode,
  type DomainConditionNode,
  type DomainGroupNode,
  type SearchFieldConfig
} from "../searchDomain";

const stringField: SearchFieldConfig = { name: "name", label: "Name", type: "string" };
const numberField: SearchFieldConfig = { name: "amount", label: "Amount", type: "number" };
const dateField: SearchFieldConfig = { name: "date", label: "Date", type: "date" };
const booleanField: SearchFieldConfig = { name: "isArchived", label: "Archived", type: "boolean" };
const enumFieldWithOptions: SearchFieldConfig = {
  name: "status",
  label: "Status",
  type: "enum",
  options: [
    { label: "Pending", value: "pending" },
    { label: "Settled", value: "settled" }
  ]
};
const expandingField: SearchFieldConfig = {
  name: "fullName",
  label: "Full name",
  type: "string",
  expandsToFields: ["firstName", "lastName"]
};

describe("operatorsForField", () => {
  it("returns the type's default operators when no override is set", () => {
    expect(operatorsForField(numberField)).toEqual([
      "=",
      "!=",
      ">",
      ">=",
      "<",
      "<=",
      "between",
      "in",
      "notIn",
      "isNull",
      "isNotNull"
    ]);
  });

  it("returns the field's own ops override when present", () => {
    expect(operatorsForField({ type: "string", ops: ["="] })).toEqual(["="]);
  });
});

describe("createEmptyGroup", () => {
  it("defaults to an 'and' connector with no children", () => {
    const group = createEmptyGroup();
    expect(group.type).toBe("group");
    expect(group.connector).toBe("and");
    expect(group.children).toEqual([]);
  });

  it("accepts an explicit connector", () => {
    expect(createEmptyGroup("or").connector).toBe("or");
  });

  it("assigns a unique id to each group", () => {
    expect(createEmptyGroup().id).not.toBe(createEmptyGroup().id);
  });
});

describe("defaultValueForField", () => {
  it("defaults to an empty array for options fields with in/notIn", () => {
    expect(defaultValueForField(enumFieldWithOptions, "in")).toEqual([]);
    expect(defaultValueForField(enumFieldWithOptions, "notIn")).toEqual([]);
  });

  it("defaults to a two-blank-string tuple for 'between'", () => {
    expect(defaultValueForField(numberField, "between")).toEqual(["", ""]);
  });

  it("defaults to the first option's value for an options field", () => {
    expect(defaultValueForField(enumFieldWithOptions, "=")).toBe("pending");
  });

  it("defaults to 'true' for a boolean field", () => {
    expect(defaultValueForField(booleanField, "=")).toBe("true");
  });

  it("defaults to an empty string otherwise", () => {
    expect(defaultValueForField(stringField, "=")).toBe("");
  });

  it("defaults to an empty string for an options field with no options", () => {
    expect(defaultValueForField({ ...enumFieldWithOptions, options: [] }, "=")).toBe("");
  });
});

describe("createCondition", () => {
  it("uses the field's first operator and that operator's default value", () => {
    const condition = createCondition(stringField);
    expect(condition.type).toBe("condition");
    expect(condition.fieldName).toBe("name");
    expect(condition.operator).toBe(operatorsForField(stringField)[0]);
    expect(condition.value).toBe("");
    expect(condition.id).toBeTruthy();
  });
});

describe("createConditionWithValue", () => {
  it("builds a condition node with the given field/operator/value", () => {
    const condition = createConditionWithValue("name", "ilike", "groceries");
    expect(condition).toMatchObject({
      type: "condition",
      fieldName: "name",
      operator: "ilike",
      value: "groceries"
    });
    expect(condition.id).toBeTruthy();
  });
});

describe("isValueComplete", () => {
  it("is always complete for isNull/isNotNull regardless of value", () => {
    expect(isValueComplete("isNull", "")).toBe(true);
    expect(isValueComplete("isNotNull", "")).toBe(true);
  });

  it("requires both bounds for a two-entry array (between)", () => {
    expect(isValueComplete("between", ["", "10"])).toBe(false);
    expect(isValueComplete("between", ["5", "10"])).toBe(true);
  });

  it("requires at least one entry for a non-two-entry array (in/notIn)", () => {
    expect(isValueComplete("in", [])).toBe(false);
    expect(isValueComplete("in", ["a"])).toBe(true);
  });

  it("requires a non-empty string otherwise", () => {
    expect(isValueComplete("=", "")).toBe(false);
    expect(isValueComplete("=", "value")).toBe(true);
  });
});

function conditionNode(overrides: Partial<DomainConditionNode> = {}): DomainConditionNode {
  return {
    type: "condition",
    id: overrides.id ?? "c1",
    fieldName: overrides.fieldName ?? "name",
    operator: overrides.operator ?? "=",
    value: overrides.value ?? "groceries"
  };
}

describe("updateNode / removeNode / addChild / countConditions", () => {
  it("updateNode replaces a leaf condition anywhere in the tree", () => {
    const leaf = conditionNode({ id: "leaf-1" });
    const root: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [
        { type: "group", id: "nested", connector: "or", children: [leaf] }
      ]
    };

    const updated = updateNode(root, "leaf-1", (node) => ({
      ...(node as DomainConditionNode),
      value: "rent"
    }));

    const nestedGroup = updated.children[0] as DomainGroupNode;
    expect((nestedGroup.children[0] as DomainConditionNode).value).toBe("rent");
    // Original tree is untouched (immutable update).
    expect((leaf as DomainConditionNode).value).toBe("groceries");
  });

  it("removeNode drops a leaf condition anywhere in the tree", () => {
    const root: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [
        conditionNode({ id: "keep" }),
        {
          type: "group",
          id: "nested",
          connector: "or",
          children: [conditionNode({ id: "drop" })]
        }
      ]
    };

    const updated = removeNode(root, "drop");

    expect(updated.children).toHaveLength(2);
    const nestedGroup = updated.children[1] as DomainGroupNode;
    expect(nestedGroup.children).toHaveLength(0);
  });

  it("addChild appends to the group matching parentId anywhere in the tree", () => {
    const root: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [{ type: "group", id: "nested", connector: "or", children: [] }]
    };
    const newLeaf = conditionNode({ id: "new" });

    const updated = addChild(root, "nested", newLeaf);

    const nestedGroup = updated.children[0] as DomainGroupNode;
    expect(nestedGroup.children).toEqual([newLeaf]);
  });

  it("updateNode leaves an unrelated leaf condition untouched while walking past it", () => {
    const untouched = conditionNode({ id: "untouched" });
    const target = conditionNode({ id: "target" });
    const root: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [untouched, target]
    };

    const updated = updateNode(root, "target", (node) => ({
      ...(node as DomainConditionNode),
      value: "rent"
    }));

    expect(updated.children[0]).toBe(untouched);
    expect((updated.children[1] as DomainConditionNode).value).toBe("rent");
  });

  it("addChild leaves an unrelated leaf condition untouched while walking past it", () => {
    const untouched = conditionNode({ id: "untouched" });
    const root: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [
        untouched,
        { type: "group", id: "nested", connector: "or", children: [] }
      ]
    };
    const newLeaf = conditionNode({ id: "new" });

    const updated = addChild(root, "nested", newLeaf);

    expect(updated.children[0]).toBe(untouched);
    expect((updated.children[1] as DomainGroupNode).children).toEqual([newLeaf]);
  });

  it("countConditions counts only leaves, recursing through nested groups", () => {
    const root: DomainGroupNode = {
      type: "group",
      id: "root",
      connector: "and",
      children: [
        conditionNode({ id: "a" }),
        {
          type: "group",
          id: "nested",
          connector: "or",
          children: [conditionNode({ id: "b" }), conditionNode({ id: "c" })]
        }
      ]
    };

    expect(countConditions(root)).toBe(3);
  });
});

describe("domainToWhere", () => {
  const fields = [stringField, numberField, booleanField, expandingField];

  it("compiles a single complete condition into a where leaf", () => {
    const node = conditionNode({ fieldName: "name", operator: "ilike", value: "groceries" });
    expect(domainToWhere(node, fields)).toEqual({
      field: "name",
      op: "ilike",
      value: "groceries"
    });
  });

  it("drops an incomplete condition, returning undefined", () => {
    const node = conditionNode({ operator: "=", value: "" });
    expect(domainToWhere(node, fields)).toBeUndefined();
  });

  it("omits the value key entirely for isNull/isNotNull", () => {
    const node = conditionNode({ operator: "isNull", value: "" });
    expect(domainToWhere(node, fields)).toEqual({ field: "name", op: "isNull" });
  });

  it("coerces both bounds to numbers for a between on a number field", () => {
    const node = conditionNode({
      fieldName: "amount",
      operator: "between",
      value: ["10", "20"]
    });
    expect(domainToWhere(node, fields)).toEqual({
      field: "amount",
      op: "between",
      value: [10, 20]
    });
  });

  it("leaves both bounds as strings for a between on a non-number field", () => {
    const node = conditionNode({
      fieldName: "date",
      operator: "between",
      value: ["2024-01-01", "2024-01-31"]
    });
    expect(domainToWhere(node, [...fields, dateField])).toEqual({
      field: "date",
      op: "between",
      value: ["2024-01-01", "2024-01-31"]
    });
  });

  it("passes the value array through unchanged for in/notIn", () => {
    const inNode = conditionNode({ fieldName: "name", operator: "in", value: ["a", "b"] });
    expect(domainToWhere(inNode, fields)).toEqual({
      field: "name",
      op: "in",
      value: ["a", "b"]
    });

    const notInNode = conditionNode({ fieldName: "name", operator: "notIn", value: ["a"] });
    expect(domainToWhere(notInNode, fields)).toEqual({
      field: "name",
      op: "notIn",
      value: ["a"]
    });
  });

  it("coerces the scalar value to a number for a number field", () => {
    const node = conditionNode({ fieldName: "amount", operator: ">", value: "42" });
    expect(domainToWhere(node, fields)).toEqual({ field: "amount", op: ">", value: 42 });
  });

  it("coerces the string 'true'/'false' to a real boolean for a boolean field", () => {
    const node = conditionNode({ fieldName: "isArchived", operator: "=", value: "true" });
    expect(domainToWhere(node, fields)).toEqual({
      field: "isArchived",
      op: "=",
      value: true
    });
  });

  it("expands a field with expandsToFields into an OR of its target fields", () => {
    const node = conditionNode({ fieldName: "fullName", operator: "ilike", value: "jane" });
    expect(domainToWhere(node, fields)).toEqual({
      or: [
        { field: "firstName", op: "ilike", value: "jane" },
        { field: "lastName", op: "ilike", value: "jane" }
      ]
    });
  });

  it("collapses a group with a single complete child to that child's where", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "and",
      children: [conditionNode({ operator: "=", value: "groceries" })]
    };
    expect(domainToWhere(group, fields)).toEqual({ field: "name", op: "=", value: "groceries" });
  });

  it("combines multiple complete children with the group's connector", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "or",
      children: [
        conditionNode({ id: "a", operator: "=", value: "groceries" }),
        conditionNode({ id: "b", fieldName: "amount", operator: ">", value: "10" })
      ]
    };
    expect(domainToWhere(group, fields)).toEqual({
      or: [
        { field: "name", op: "=", value: "groceries" },
        { field: "amount", op: ">", value: 10 }
      ]
    });
  });

  it("combines multiple complete children with an 'and' connector", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "and",
      children: [
        conditionNode({ id: "a", operator: "=", value: "groceries" }),
        conditionNode({ id: "b", fieldName: "amount", operator: ">", value: "10" })
      ]
    };
    expect(domainToWhere(group, fields)).toEqual({
      and: [
        { field: "name", op: "=", value: "groceries" },
        { field: "amount", op: ">", value: 10 }
      ]
    });
  });

  it("returns undefined for an empty group", () => {
    expect(domainToWhere(createEmptyGroup(), fields)).toBeUndefined();
  });

  it("drops incomplete children while keeping complete ones", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "and",
      children: [
        conditionNode({ id: "a", operator: "=", value: "" }),
        conditionNode({ id: "b", operator: "=", value: "groceries" })
      ]
    };
    expect(domainToWhere(group, fields)).toEqual({ field: "name", op: "=", value: "groceries" });
  });
});

describe("matchesWhere", () => {
  it("matches everything when where is undefined", () => {
    expect(matchesWhere({ name: "anything" }, undefined)).toBe(true);
  });

  it("evaluates a plain leaf condition", () => {
    expect(matchesWhere({ amount: 50 }, { field: "amount", op: ">", value: 10 })).toBe(true);
    expect(matchesWhere({ amount: 5 }, { field: "amount", op: ">", value: 10 })).toBe(false);
  });

  it("reads a nested field path via dot notation", () => {
    expect(
      matchesWhere({ account: { name: "Checking" } }, { field: "account.name", op: "=", value: "Checking" })
    ).toBe(true);
  });

  it("resolves to undefined when a nested path's intermediate value isn't an object", () => {
    expect(
      matchesWhere({ account: null }, { field: "account.name", op: "isNull" })
    ).toBe(true);
  });

  it("evaluates != ", () => {
    expect(matchesWhere({ status: "pending" }, { field: "status", op: "!=", value: "settled" })).toBe(
      true
    );
    expect(matchesWhere({ status: "pending" }, { field: "status", op: "!=", value: "pending" })).toBe(
      false
    );
  });

  it("evaluates >= and <=", () => {
    expect(matchesWhere({ amount: 10 }, { field: "amount", op: ">=", value: 10 })).toBe(true);
    expect(matchesWhere({ amount: 9 }, { field: "amount", op: ">=", value: 10 })).toBe(false);
    expect(matchesWhere({ amount: 10 }, { field: "amount", op: "<=", value: 10 })).toBe(true);
    expect(matchesWhere({ amount: 11 }, { field: "amount", op: "<=", value: 10 })).toBe(false);
  });

  it("evaluates numeric comparisons as false when the actual value isn't a number", () => {
    expect(matchesWhere({ amount: "not-a-number" }, { field: "amount", op: ">", value: 10 })).toBe(
      false
    );
    expect(matchesWhere({ amount: "not-a-number" }, { field: "amount", op: ">=", value: 10 })).toBe(
      false
    );
    expect(matchesWhere({ amount: "not-a-number" }, { field: "amount", op: "<", value: 10 })).toBe(
      false
    );
    expect(matchesWhere({ amount: "not-a-number" }, { field: "amount", op: "<=", value: 10 })).toBe(
      false
    );
  });

  it("evaluates isNull/isNotNull", () => {
    expect(matchesWhere({ categoryId: null }, { field: "categoryId", op: "isNull" })).toBe(true);
    expect(matchesWhere({ categoryId: "food" }, { field: "categoryId", op: "isNotNull" })).toBe(true);
  });

  it("evaluates between", () => {
    expect(matchesWhere({ amount: 15 }, { field: "amount", op: "between", value: [10, 20] })).toBe(
      true
    );
    expect(matchesWhere({ amount: 25 }, { field: "amount", op: "between", value: [10, 20] })).toBe(
      false
    );
    expect(
      matchesWhere({ amount: null }, { field: "amount", op: "between", value: [10, 20] })
    ).toBe(false);
  });

  it("evaluates in/notIn", () => {
    expect(matchesWhere({ status: "pending" }, { field: "status", op: "in", value: ["pending"] })).toBe(
      true
    );
    expect(
      matchesWhere({ status: "settled" }, { field: "status", op: "in", value: ["pending"] })
    ).toBe(false);
    expect(
      matchesWhere({ status: "settled" }, { field: "status", op: "notIn", value: ["pending"] })
    ).toBe(true);
    expect(
      matchesWhere({ status: "pending" }, { field: "status", op: "notIn", value: ["pending"] })
    ).toBe(false);
  });

  it("treats an unrecognized operator as always matching", () => {
    expect(
      matchesWhere({ status: "pending" }, { field: "status", op: "unknownOp", value: "x" })
    ).toBe(true);
  });

  it("evaluates string pattern operators case-insensitively", () => {
    expect(matchesWhere({ name: "Groceries" }, { field: "name", op: "ilike", value: "grocer" })).toBe(
      true
    );
    expect(matchesWhere({ name: "Groceries" }, { field: "name", op: "startsWith", value: "gro" })).toBe(
      true
    );
    expect(matchesWhere({ name: "Groceries" }, { field: "name", op: "endsWith", value: "ies" })).toBe(
      true
    );
  });

  it("combines conditions with and/or/not", () => {
    const item = { name: "Groceries", amount: 50 };
    expect(
      matchesWhere(item, {
        and: [
          { field: "name", op: "=", value: "Groceries" },
          { field: "amount", op: ">", value: 10 }
        ]
      })
    ).toBe(true);
    expect(
      matchesWhere(item, { or: [{ field: "amount", op: ">", value: 100 }, { field: "amount", op: "<", value: 100 }] })
    ).toBe(true);
    expect(matchesWhere(item, { not: { field: "amount", op: ">", value: 100 } })).toBe(true);
  });
});

describe("conditionValueText", () => {
  it("renders a plain scalar condition", () => {
    expect(conditionValueText(numberField, conditionNode({ fieldName: "amount", operator: ">=", value: "10" }))).toBe(
      "at least 10"
    );
  });

  it("renders a between condition with both bounds", () => {
    expect(
      conditionValueText(
        numberField,
        conditionNode({ fieldName: "amount", operator: "between", value: ["10", "20"] })
      )
    ).toBe("is between 10 and 20");
  });

  it("resolves an option value to its label", () => {
    expect(
      conditionValueText(
        enumFieldWithOptions,
        conditionNode({ fieldName: "status", operator: "=", value: "pending" })
      )
    ).toBe("is Pending");
  });

  it("resolves multiple option values to a joined label list", () => {
    expect(
      conditionValueText(
        enumFieldWithOptions,
        conditionNode({ fieldName: "status", operator: "in", value: ["pending", "settled"] })
      )
    ).toBe("is any of Pending, Settled");
  });

  it("falls back to the raw value when it matches no option (scalar and array)", () => {
    expect(
      conditionValueText(
        enumFieldWithOptions,
        conditionNode({ fieldName: "status", operator: "=", value: "archived" })
      )
    ).toBe("is archived");
    expect(
      conditionValueText(
        enumFieldWithOptions,
        conditionNode({ fieldName: "status", operator: "in", value: ["archived"] })
      )
    ).toBe("is any of archived");
  });

  it("falls back to the raw operator string for an operator with no label", () => {
    expect(
      conditionValueText(
        numberField,
        conditionNode({ fieldName: "amount", operator: "unknownOp" as never, value: "10" })
      )
    ).toBe("unknownOp 10");
  });
});

describe("domainToSummaryText", () => {
  const fields = [stringField, numberField];

  it("renders a single condition with its field label", () => {
    const node = conditionNode({ fieldName: "name", operator: "=", value: "groceries" });
    expect(domainToSummaryText(node, fields)).toBe("Name is groceries");
  });

  it("returns an empty string for a condition on an unknown field", () => {
    const node = conditionNode({ fieldName: "unknown", operator: "=", value: "x" });
    expect(domainToSummaryText(node, fields)).toBe("");
  });

  it("joins a group's children with the connector, parenthesized when there are 2+", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "and",
      children: [
        conditionNode({ id: "a", fieldName: "name", operator: "=", value: "groceries" }),
        conditionNode({ id: "b", fieldName: "amount", operator: ">", value: "10" })
      ]
    };
    expect(domainToSummaryText(group, fields)).toBe("(Name is groceries) AND (Amount greater than 10)");
  });

  it("returns a single child's text unparenthesized", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "and",
      children: [conditionNode({ fieldName: "name", operator: "=", value: "groceries" })]
    };
    expect(domainToSummaryText(group, fields)).toBe("Name is groceries");
  });

  it("returns an empty string for an empty group", () => {
    expect(domainToSummaryText(createEmptyGroup(), fields)).toBe("");
  });

  it("joins an 'or' group's children with OR", () => {
    const group: DomainGroupNode = {
      type: "group",
      id: "g1",
      connector: "or",
      children: [
        conditionNode({ id: "a", fieldName: "name", operator: "=", value: "groceries" }),
        conditionNode({ id: "b", fieldName: "amount", operator: ">", value: "10" })
      ]
    };
    expect(domainToSummaryText(group, fields)).toBe("(Name is groceries) OR (Amount greater than 10)");
  });
});
