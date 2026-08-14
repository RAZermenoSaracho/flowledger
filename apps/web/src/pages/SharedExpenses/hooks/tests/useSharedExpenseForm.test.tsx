import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { SharedExpense } from "../../../../types/sharedExpenses.types";
import { useSharedExpenseForm } from "../useSharedExpenseForm";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockBaseline() {
  server.use(
    http.get(`${API_URL}/transactions`, () =>
      HttpResponse.json({ data: [{ id: "tx-1", name: "Dinner" }], meta: {} })
    )
  );
}

function mockBaselineWithAmount(amount = 100) {
  server.use(
    http.get(`${API_URL}/transactions`, () =>
      HttpResponse.json({
        data: [{ id: "tx-1", name: "Dinner", amount, executionCurrency: "USD" }],
        meta: {}
      })
    )
  );
}

const sharedExpense: SharedExpense = {
  id: "se-1",
  transactionId: "tx-1",
  ownerUserId: "user-1",
  title: "Dinner split",
  totalAmount: 100,
  status: "open",
  participants: [
    {
      id: "p-1",
      userId: "user-2",
      participantName: "Friend",
      currency: "USD",
      shareAmount: 50,
      paidAmount: 20,
      status: "partial"
    },
    {
      id: "p-2",
      userId: null,
      participantName: "Roommate",
      currency: "USD",
      shareAmount: 30,
      paidAmount: 0,
      status: "pending"
    }
  ],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

describe("useSharedExpenseForm", () => {
  it("starts with empty/default state", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    expect(result.current.title).toBe("");
    expect(result.current.status).toBe("open");
    expect(result.current.editingId).toBeNull();
    expect(result.current.participants).toEqual([]);
    expect(result.current.isFormOpen).toBe(false);
  });

  it("adds a manual participant, ignoring blank/whitespace-only names", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.setParticipantName("   "));
    act(() => result.current.addManualParticipant());
    expect(result.current.participants).toHaveLength(0);

    act(() => result.current.setParticipantName("Roommate"));
    act(() => result.current.addManualParticipant());

    expect(result.current.participants).toHaveLength(1);
    expect(result.current.participants[0]).toMatchObject({
      participantName: "Roommate",
      source: "manual",
      paidAmount: "0"
    });
    expect(result.current.participantName).toBe("");
  });

  it("adds a user participant, deduping by userId", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });
    const user = { id: "user-2", name: "Jane", email: "jane@example.com" };

    act(() => result.current.addUserParticipant(user));
    expect(result.current.participants).toHaveLength(1);
    expect(result.current.participants[0]).toMatchObject({
      userId: "user-2",
      participantName: "Jane",
      source: "app"
    });

    act(() => result.current.addUserParticipant(user));
    expect(result.current.participants).toHaveLength(1);
  });

  it("updates a participant's shareAmount/paidAmount by draftId", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.setParticipantName("Roommate"));
    act(() => result.current.addManualParticipant());
    const draftId = result.current.participants[0]!.draftId;

    act(() => result.current.updateParticipant(draftId, "shareAmount", "50"));

    expect(result.current.participants[0]!.shareAmount).toBe("50");
  });

  it("removes a participant by draftId", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.setParticipantName("Roommate"));
    act(() => result.current.addManualParticipant());
    const draftId = result.current.participants[0]!.draftId;

    act(() => result.current.removeParticipant(draftId));

    expect(result.current.participants).toHaveLength(0);
  });

  it("editSharedExpense populates form state from an existing record", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.editSharedExpense(sharedExpense));

    expect(result.current.title).toBe("Dinner split");
    expect(result.current.editingId).toBe("se-1");
    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.participants).toHaveLength(2);
    expect(result.current.participants[0]).toMatchObject({
      draftId: "p-1",
      userId: "user-2",
      source: "app",
      shareAmount: "50"
    });
    expect(result.current.participants[1]).toMatchObject({
      draftId: "p-2",
      source: "manual"
    });
  });

  it("closeForm resets every field back to its default", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.editSharedExpense(sharedExpense));
    act(() => result.current.closeForm());

    expect(result.current.title).toBe("");
    expect(result.current.editingId).toBeNull();
    expect(result.current.participants).toEqual([]);
    expect(result.current.isFormOpen).toBe(false);
  });

  it("computes remainingAmount and sharesExceedTransactionAmount once a transaction with participants is selected", async () => {
    mockBaselineWithAmount(100);
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.setTransactionId("tx-1"));
    await waitFor(() => expect(result.current.selectedTransaction).toBeDefined());

    act(() => result.current.setParticipantName("Roommate"));
    act(() => result.current.addManualParticipant());
    const draftId = result.current.participants[0]!.draftId;
    act(() => result.current.updateParticipant(draftId, "shareAmount", "60"));

    expect(result.current.participantShareTotal).toBe(60);
    expect(result.current.remainingAmount).toBe(40);
    expect(result.current.sharesExceedTransactionAmount).toBe(false);

    act(() => result.current.updateParticipant(draftId, "shareAmount", "150"));

    expect(result.current.remainingAmount).toBe(-50);
    expect(result.current.sharesExceedTransactionAmount).toBe(true);
  });

  it("submit creates a new shared expense with computed participant statuses when there is no editingId", async () => {
    mockBaseline();
    let createdBody: { participants: { status: string }[] } | undefined;
    server.use(
      http.post(`${API_URL}/shared-expenses`, async ({ request }) => {
        createdBody = (await request.json()) as typeof createdBody;
        return HttpResponse.json({ sharedExpense });
      })
    );
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.setTitle("Dinner split"));
    act(() => result.current.setTransactionId("tx-1"));
    act(() => result.current.setParticipantName("Roommate"));
    act(() => result.current.addManualParticipant());
    const draftId = result.current.participants[0]!.draftId;
    act(() => result.current.updateParticipant(draftId, "shareAmount", "50"));
    act(() => result.current.updateParticipant(draftId, "paidAmount", "50"));

    await act(async () => {
      await result.current.submit({ preventDefault: () => {} } as React.FormEvent);
    });

    await waitFor(() => expect(createdBody).toBeDefined());
    expect(createdBody?.participants[0]?.status).toBe("paid");
    expect(result.current.isFormOpen).toBe(false);
  });

  it("submit updates the existing shared expense when editingId is set", async () => {
    mockBaseline();
    let updatedId: string | undefined;
    server.use(
      http.put(`${API_URL}/shared-expenses/:id`, ({ params }) => {
        updatedId = params.id as string;
        return HttpResponse.json({ sharedExpense });
      })
    );
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.editSharedExpense(sharedExpense));

    await act(async () => {
      await result.current.submit({ preventDefault: () => {} } as React.FormEvent);
    });

    await waitFor(() => expect(updatedId).toBe("se-1"));
  });

  it("resolves selectedTransaction from the loaded transaction list", async () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    await waitFor(() => expect(result.current.transactionsQuery.data).toBeDefined());
    act(() => result.current.setTransactionId("tx-1"));

    expect(result.current.selectedTransaction?.name).toBe("Dinner");
  });

  it("only enables the user search query once the trimmed search is longer than 1 character", () => {
    mockBaseline();
    const { result } = renderHook(() => useSharedExpenseForm(), { wrapper });

    act(() => result.current.setUserSearch("j"));
    expect(result.current.userSearchQuery.fetchStatus).toBe("idle");

    act(() => result.current.setUserSearch("ja"));
    expect(result.current.trimmedUserSearch).toBe("ja");
  });
});
