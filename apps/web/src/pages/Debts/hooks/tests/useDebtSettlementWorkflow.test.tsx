import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Debt, SettlementRequest } from "../../../../types/debts.types";
import type { Group } from "../../../../types/groups.types";
import { useDebtSettlementWorkflow } from "../useDebtSettlementWorkflow";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

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
    id: "cat-private-expense",
    name: "General",
    type: "expense",
    isArchived: false,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: 100,
    paidAmount: 0,
    status: "pending",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 100,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "open",
      transaction: { groupId: null, categoryId: null } as Debt["sharedExpense"]["transaction"],
      participants: [],
      createdAt: "",
      updatedAt: ""
    },
    settlementRequests: [],
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
    sharedExpenseParticipant: makeDebt(),
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function renderWorkflow(overrides: Partial<Parameters<typeof useDebtSettlementWorkflow>[0]> = {}) {
  return renderHook(
    () =>
      useDebtSettlementWorkflow({
        groupById: new Map(),
        privateExpenseCategories: [makeCategory()],
        privateIncomeCategories: [makeCategory({ id: "cat-private-income", type: "income" })],
        accounts: [makeAccount()],
        ...overrides
      }),
    { wrapper }
  );
}

describe("useDebtSettlementWorkflow — drafts", () => {
  it("draftFor defaults amount to the available settlement amount and the first account/private category", () => {
    const { result } = renderWorkflow();
    const draft = result.current.draftFor(makeDebt());

    expect(draft.amount).toBe("100");
    expect(draft.accountId).toBe("acc-1");
    expect(draft.categoryId).toBe("cat-private-expense");
  });

  it("draftFor uses the original transaction's category when the debt's transaction belongs to a group", () => {
    const group: Group = {
      id: "group-1",
      name: "Roommates",
      ownerUserId: "user-1",
      isArchived: false,
      members: [],
      categories: [makeCategory({ id: "cat-group-expense", type: "expense" })],
      createdAt: "",
      updatedAt: ""
    };
    const debt = makeDebt({
      sharedExpense: {
        ...makeDebt().sharedExpense,
        transaction: { groupId: "group-1", categoryId: "cat-group-expense" } as Debt["sharedExpense"]["transaction"]
      }
    });
    const { result } = renderWorkflow({ groupById: new Map([["group-1", group]]) });

    expect(result.current.draftFor(debt).categoryId).toBe("cat-group-expense");
  });

  it("updateDraft merges a field into the current draft", () => {
    const { result } = renderWorkflow();
    const debt = makeDebt();

    act(() => result.current.updateDraft(debt, "note", "Paying you back"));

    expect(result.current.draftFor(debt).note).toBe("Paying you back");
    expect(result.current.draftFor(debt).accountId).toBe("acc-1");
  });

  it("isSettlementDraftComplete requires a positive amount within the available amount plus account/category", () => {
    const { result } = renderWorkflow();
    const debt = makeDebt({ outstandingAmount: 100 });

    expect(result.current.isSettlementDraftComplete(debt)).toBe(true);

    act(() => result.current.updateDraft(debt, "amount", "0"));
    expect(result.current.isSettlementDraftComplete(debt)).toBe(false);

    act(() => result.current.updateDraft(debt, "amount", "150"));
    expect(result.current.isSettlementDraftComplete(debt)).toBe(false);

    act(() => result.current.updateDraft(debt, "amount", "50"));
    act(() => result.current.updateDraft(debt, "accountId", ""));
    expect(result.current.isSettlementDraftComplete(debt)).toBe(false);
  });

  it("categoryOptionsFor returns the group's expense categories when the debt belongs to a group, else private categories", () => {
    const group: Group = {
      id: "group-1",
      name: "Roommates",
      ownerUserId: "user-1",
      isArchived: false,
      members: [],
      categories: [
        makeCategory({ id: "cat-group-expense", type: "expense" }),
        makeCategory({ id: "cat-group-income", type: "income" })
      ],
      createdAt: "",
      updatedAt: ""
    };
    const { result } = renderWorkflow({ groupById: new Map([["group-1", group]]) });

    const groupedDebt = makeDebt({
      sharedExpense: {
        ...makeDebt().sharedExpense,
        transaction: { groupId: "group-1" } as Debt["sharedExpense"]["transaction"]
      }
    });
    expect(result.current.categoryOptionsFor(groupedDebt)).toEqual([
      makeCategory({ id: "cat-group-expense", type: "expense" })
    ]);

    expect(result.current.categoryOptionsFor(makeDebt())).toEqual([makeCategory()]);
  });
});

describe("useDebtSettlementWorkflow — approval drafts", () => {
  it("approvalDraftFor defaults to the first account/income category, no expense offset by default", () => {
    const { result } = renderWorkflow();
    const draft = result.current.approvalDraftFor(makeRequest());

    expect(draft.accountId).toBe("acc-1");
    expect(draft.categoryId).toBe("cat-private-income");
    expect(draft.expenseOffsetCategoryId).toBe("");
  });

  it("approvalDraftFor pre-selects the expense-offset category when the original category is a valid expense option", () => {
    const request = makeRequest({
      sharedExpenseParticipant: makeDebt({
        sharedExpense: {
          ...makeDebt().sharedExpense,
          transaction: { categoryId: "cat-private-expense" } as Debt["sharedExpense"]["transaction"]
        }
      })
    });
    const { result } = renderWorkflow();

    expect(result.current.approvalDraftFor(request).expenseOffsetCategoryId).toBe(
      "cat-private-expense"
    );
  });

  it("updateApprovalDraft merges a field into the current approval draft", () => {
    const { result } = renderWorkflow();
    const request = makeRequest();

    act(() => result.current.updateApprovalDraft(request, "categoryId", "cat-private-income"));

    expect(result.current.approvalDraftFor(request).categoryId).toBe("cat-private-income");
  });
});

describe("useDebtSettlementWorkflow — selection", () => {
  it("toggleDebtSelection adds and removes a debt id", () => {
    const { result } = renderWorkflow();

    act(() => result.current.toggleDebtSelection("debt-1"));
    expect(result.current.selectedDebtIds.has("debt-1")).toBe(true);

    act(() => result.current.toggleDebtSelection("debt-1"));
    expect(result.current.selectedDebtIds.has("debt-1")).toBe(false);
  });

  it("setDetailSelection selects/deselects a batch of debts", () => {
    const { result } = renderWorkflow();
    const debts = [makeDebt({ id: "debt-1" }), makeDebt({ id: "debt-2" })];

    act(() => result.current.setDetailSelection(debts, true));
    expect(result.current.selectedDebtIds).toEqual(new Set(["debt-1", "debt-2"]));

    act(() => result.current.setDetailSelection(debts, false));
    expect(result.current.selectedDebtIds.size).toBe(0);
  });

  it("toggleApprovalSelection and setApprovalSelection mirror the debt-selection behavior", () => {
    const { result } = renderWorkflow();
    const requests = [makeRequest({ id: "sr-1" }), makeRequest({ id: "sr-2" })];

    act(() => result.current.toggleApprovalSelection("sr-1"));
    expect(result.current.selectedApprovalIds.has("sr-1")).toBe(true);

    act(() => result.current.setApprovalSelection(requests, true));
    expect(result.current.selectedApprovalIds).toEqual(new Set(["sr-1", "sr-2"]));
  });
});

describe("useDebtSettlementWorkflow — mutations", () => {
  it("submitSettlement creates the request and clears the draft/selection", async () => {
    let postedBody: unknown;
    server.use(
      http.post(`${API_URL}/debts/debt-1/settlement-request`, async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json({ settlementRequest: makeRequest() });
      })
    );
    const { result } = renderWorkflow();
    const debt = makeDebt();
    act(() => result.current.toggleDebtSelection(debt.id));

    await act(async () => {
      await result.current.submitSettlement({ preventDefault: () => {} } as React.FormEvent, debt);
    });

    expect(postedBody).toMatchObject({ amount: 100, accountId: "acc-1" });
    expect(result.current.selectedDebtIds.has(debt.id)).toBe(false);
  });

  it("submitBatchSettlement is a no-op when nothing is selected", async () => {
    let called = false;
    server.use(
      http.post(`${API_URL}/debts/settlement-requests/batch`, () => {
        called = true;
        return HttpResponse.json({ settlementRequests: [] });
      })
    );
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.submitBatchSettlement(
        { preventDefault: () => {} } as React.FormEvent,
        []
      );
    });

    expect(called).toBe(false);
  });

  it("submitBatchSettlement is a no-op when a selected debt's draft is incomplete", async () => {
    let called = false;
    server.use(
      http.post(`${API_URL}/debts/settlement-requests/batch`, () => {
        called = true;
        return HttpResponse.json({ settlementRequests: [] });
      })
    );
    const { result } = renderWorkflow();
    const debt = makeDebt();
    act(() => result.current.updateDraft(debt, "amount", "0"));

    await act(async () => {
      await result.current.submitBatchSettlement(
        { preventDefault: () => {} } as React.FormEvent,
        [debt]
      );
    });

    expect(called).toBe(false);
  });

  it("submitBatchSettlement creates batch requests when every draft is complete", async () => {
    let requestCount = 0;
    server.use(
      http.post(`${API_URL}/debts/settlement-requests/batch`, async ({ request }) => {
        const body = (await request.json()) as { requests: unknown[] };
        requestCount = body.requests.length;
        return HttpResponse.json({ settlementRequests: [] });
      })
    );
    const { result } = renderWorkflow();
    const debts = [makeDebt({ id: "debt-1" }), makeDebt({ id: "debt-2" })];

    await act(async () => {
      await result.current.submitBatchSettlement(
        { preventDefault: () => {} } as React.FormEvent,
        debts
      );
    });

    expect(requestCount).toBe(2);
  });

  it("submitBatchApproval approves with each request's draft", async () => {
    let approvalCount = 0;
    server.use(
      http.post(`${API_URL}/settlements/approve/batch`, async ({ request }) => {
        const body = (await request.json()) as { approvals: unknown[] };
        approvalCount = body.approvals.length;
        return HttpResponse.json({});
      })
    );
    const { result } = renderWorkflow();
    const requests = [makeRequest({ id: "sr-1" }), makeRequest({ id: "sr-2" })];

    await act(async () => {
      await result.current.submitBatchApproval(requests);
    });

    expect(approvalCount).toBe(2);
  });

  it("rejectSettlement rejects the request", async () => {
    let rejected = false;
    server.use(
      http.post(`${API_URL}/settlements/sr-1/reject`, () => {
        rejected = true;
        return HttpResponse.json({ settlementRequest: makeRequest({ status: "rejected" }) });
      })
    );
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.rejectSettlement.mutateAsync("sr-1");
    });

    expect(rejected).toBe(true);
  });

  it("isActing reflects a pending mutation", async () => {
    let resolveRequest!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    server.use(
      http.post(`${API_URL}/settlements/sr-1/reject`, async () => {
        await gate;
        return HttpResponse.json({ settlementRequest: makeRequest({ status: "rejected" }) });
      })
    );
    const { result } = renderWorkflow();
    expect(result.current.isActing).toBe(false);

    let mutationPromise!: Promise<unknown>;
    act(() => {
      mutationPromise = result.current.rejectSettlement.mutateAsync("sr-1");
    });

    await waitFor(() => expect(result.current.isActing).toBe(true));

    resolveRequest();
    await act(async () => {
      await mutationPromise;
    });
    await waitFor(() => expect(result.current.isActing).toBe(false));
  });
});
