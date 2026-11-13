import { describe, expect, it } from "vitest";
import { groupByFields } from "../groupByFields";

describe("groupByFields", () => {
  type Row = { id: string; categoryId: string; categoryName: string };

  const rows: Row[] = [
    { id: "1", categoryId: "food", categoryName: "Food" },
    { id: "2", categoryId: "food", categoryName: "Food" },
    { id: "3", categoryId: "rent", categoryName: "Rent" }
  ];

  function keyOf(item: Row, groupById: string) {
    if (groupById === "categoryId") {
      return { key: item.categoryId, label: item.categoryName };
    }
    return { key: "", label: "" };
  }

  it("returns a single flat section when no group-bys are active", () => {
    expect(groupByFields(rows, [], [{ id: "categoryId", label: "Category" }], keyOf)).toEqual([
      { key: "", label: "", items: rows }
    ]);
  });

  it("returns a single flat section for an empty items list", () => {
    expect(
      groupByFields([], ["categoryId"], [{ id: "categoryId", label: "Category" }], keyOf)
    ).toEqual([{ key: "", label: "", items: [] }]);
  });

  it("buckets items by the active group-by field, sorted by key", () => {
    const result = groupByFields(
      rows,
      ["categoryId"],
      [{ id: "categoryId", label: "Category" }],
      keyOf
    );

    expect(result).toEqual([
      { key: "food", label: "Food", items: [rows[0], rows[1]] },
      { key: "rent", label: "Rent", items: [rows[2]] }
    ]);
  });

  it("ignores an active group-by id that isn't in the groupBys definition list", () => {
    const result = groupByFields(rows, ["unknownId"], [], keyOf);

    expect(result).toEqual([{ key: "", label: "", items: rows }]);
  });
});
