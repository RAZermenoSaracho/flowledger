import type { NotificationRule } from "@flowledger/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RuleCard } from "../RuleCard";

const slots = [
  { key: "card", kind: "account" as const, label: "Card", required: true },
  { key: "food", kind: "category" as const, label: "Food", required: false }
];
const expense: NotificationRule = {
  match: "all",
  conditions: [{ kind: "contains", text: "paid", ignoreCase: true }],
  extract: { pattern: "(\\d+)", method: "search", ignoreCase: false, missingReason: "none" },
  action: { kind: "expense", amount: { group: 1 }, name: { fixed: "Shop" } }
};

function setup(rule: NotificationRule) {
  const onChange = vi.fn();
  render(<RuleCard rule={rule} index={0} total={2} slots={slots} onChange={onChange} onMove={vi.fn()} onRemove={vi.fn()} />);
  return onChange;
}

describe("RuleCard", () => {
  it("lists only the model's slots of the matching kind", () => {
    setup(expense);
    expect(within(screen.getByLabelText("Rule 1 account")).getAllByRole("option").map((o) => o.textContent)).toEqual(["None", "Card (card)"]);
    expect(within(screen.getByLabelText("Rule 1 category")).getAllByRole("option").map((o) => o.textContent)).toEqual(["None", "Food (food)"]);
  });

  it("reports edits through onChange", async () => {
    const onChange = setup(expense);
    await userEvent.selectOptions(screen.getByLabelText("Rule 1 action"), "skip");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ action: { kind: "skip", reason: "skipped" } }));
    await userEvent.selectOptions(screen.getByLabelText("Rule 1 condition 1 kind"), "matches");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ conditions: [{ kind: "matches", pattern: "paid", method: "search", ignoreCase: true }] })
    );
  });

  it("disables capture-group choices when the rule has no extract", () => {
    setup({ ...expense, extract: undefined, action: { kind: "expense", amount: { fixed: "5.00" }, name: { fixed: "x" } } });
    expect(within(screen.getByLabelText("Rule 1 amount")).getByRole("option", { name: "Captured group" })).toBeDisabled();
  });
});
