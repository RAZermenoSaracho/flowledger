import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FormDraft } from "../../../../types/common.types";
import type { AccountDraft } from "../../types/accounts.types";
import {
  ACCOUNT_TYPE_SECTIONS,
  AccountTypeSections
} from "../AccountTypeSections";

const draft = {} as FormDraft<AccountDraft>;
const sections = { savings: () => <p>Savings section</p> };

describe("AccountTypeSections", () => {
  it("renders a registered section only for its type", () => {
    const { rerender } = render(
      <AccountTypeSections type="savings" draft={draft} sections={sections} />
    );
    expect(screen.getByText("Savings section")).toBeInTheDocument();

    rerender(
      <AccountTypeSections type="checking" draft={draft} sections={sections} />
    );
    expect(screen.queryByText("Savings section")).not.toBeInTheDocument();
  });

  it("registers no sections today", () => {
    expect(ACCOUNT_TYPE_SECTIONS).toEqual({});
  });
});
