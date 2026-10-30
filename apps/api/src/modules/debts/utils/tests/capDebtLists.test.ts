import { describe, expect, it } from "vitest";
import { capDebtLists, DEBT_LIST_CAP } from "../capDebtLists.js";

describe("capDebtLists", () => {
  it("caps each section independently and reports untruncated totals", () => {
    const big = Array.from({ length: DEBT_LIST_CAP + 5 }, (_, i) => i);
    const result = capDebtLists({ iOwe: big, owedToMe: [1], settledDebts: [] });

    expect(result.iOwe).toHaveLength(DEBT_LIST_CAP);
    expect(result.owedToMe).toEqual([1]);
    expect(result.totals).toEqual({ iOwe: DEBT_LIST_CAP + 5, owedToMe: 1, settledDebts: 0 });
  });
});
