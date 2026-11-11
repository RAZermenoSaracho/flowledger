import { describe, expect, it } from "vitest";
import type { AccountDraft } from "../../types/accounts.types";
import { validateAccountDraft } from "../accountValidation";

const valid: AccountDraft = {
  name: "Checking",
  type: "checking",
  identifier: "",
  currency: "USD",
  initialBalance: "10"
};

describe("validateAccountDraft", () => {
  it("returns no errors for a valid draft", () => {
    expect(validateAccountDraft(valid)).toEqual({});
  });

  it("flags a blank name", () => {
    expect(validateAccountDraft({ ...valid, name: "  " }).name).toBeTruthy();
  });

  it("flags a non-numeric balance", () => {
    expect(
      validateAccountDraft({ ...valid, initialBalance: "abc" }).initialBalance
    ).toBeTruthy();
  });

  it("treats a blank balance as valid", () => {
    expect(validateAccountDraft({ ...valid, initialBalance: "" })).toEqual({});
  });
});
