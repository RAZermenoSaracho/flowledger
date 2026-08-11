import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Debt, SettlementRequest } from "../../../../types/debts.types";
import { ApprovalActions } from "../ApprovalActions";

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    currency: "USD",
    initialBalance: 0,
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Reimbursements",
    type: "income",
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeRequest(overrides: Partial<SettlementRequest> = {}): SettlementRequest {
  return {
    id: "sr-1",
    sharedExpenseParticipantId: "debt-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    amount: 50,
    status: "pending",
    sharedExpenseParticipant: {
      sharedExpense: { transaction: { type: "expense" } }
    } as unknown as Debt,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof ApprovalActions>[0]> = {}) {
  return {
    request: makeRequest(),
    accounts: [makeAccount()],
    incomeCategories: [makeCategory()],
    expenseOffsetCategories: [makeCategory({ id: "cat-expense", type: "expense" })],
    draft: { accountId: "", categoryId: "", expenseOffsetCategoryId: "" },
    isActing: false,
    onDraftChange: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    ...overrides
  };
}

describe("ApprovalActions", () => {
  it("renders account/category selects with 'Select account'/'Select category' placeholders", () => {
    renderWithProviders(<ApprovalActions {...baseProps()} />);
    expect(screen.getByLabelText("Deposit account")).toBeInTheDocument();
    expect(screen.getByLabelText("Income category")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Checking" })).toBeInTheDocument();
  });

  it("enables the offset category select only for an expense-originated request", () => {
    renderWithProviders(<ApprovalActions {...baseProps()} />);
    expect(screen.getByLabelText("Offset category")).not.toBeDisabled();
  });

  it("disables the offset category select for a non-expense-originated request", () => {
    renderWithProviders(
      <ApprovalActions
        {...baseProps({
          request: makeRequest({
            sharedExpenseParticipant: {
              sharedExpense: { transaction: { type: "income" } }
            } as unknown as Debt
          })
        })}
      />
    );
    expect(screen.getByLabelText("Offset category")).toBeDisabled();
  });

  it("calls onDraftChange when a field changes", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ApprovalActions {...props} />);

    await user.selectOptions(screen.getByLabelText("Deposit account"), "acc-1");

    expect(props.onDraftChange).toHaveBeenCalledWith("accountId", "acc-1");
  });

  it("disables Approve until both account and category are set", () => {
    renderWithProviders(<ApprovalActions {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("enables Approve once account and category are set, calling onApprove on submit", async () => {
    const user = userEvent.setup();
    const props = baseProps({
      draft: { accountId: "acc-1", categoryId: "cat-1", expenseOffsetCategoryId: "" }
    });
    renderWithProviders(<ApprovalActions {...props} />);

    expect(screen.getByRole("button", { name: "Approve" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(props.onApprove).toHaveBeenCalled();
  });

  it("calls onReject when Reject is clicked", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<ApprovalActions {...props} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(props.onReject).toHaveBeenCalledOnce();
  });

  it("disables both actions while isActing", () => {
    renderWithProviders(<ApprovalActions {...baseProps({ isActing: true })} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });
});
