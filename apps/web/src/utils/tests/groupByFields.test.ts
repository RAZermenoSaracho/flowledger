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

  it("returns undefined when no group-bys are active", () => {
    expect(groupByFields(rows, [], keyOf)).toBeUndefined();
    expect(groupByFields(rows, undefined, keyOf)).toBeUndefined();
  });

  it("returns a single flat section for an empty items list", () => {
    expect(groupByFields([], ["categoryId"], keyOf)).toEqual([
      { key: "", label: "", items: [] }
    ]);
  });

  it("buckets items by the active group-by field, sorted by key", () => {
    expect(groupByFields(rows, ["categoryId"], keyOf)).toEqual([
      { key: "food", label: "Food", items: [rows[0], rows[1]] },
      { key: "rent", label: "Rent", items: [rows[2]] }
    ]);
  });
});
