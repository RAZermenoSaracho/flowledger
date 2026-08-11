import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { ProviderImportedTransaction } from "../../../../types/transactions.types";
import { useImportedTransactionsWorkflow } from "../useImportedTransactionsWorkflow";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function makeImportedTransaction(
  overrides: Partial<ProviderImportedTransaction> = {}
): ProviderImportedTransaction {
  return {
    id: "pt-1",
    status: "pending",
    name: "Coffee shop",
    amount: 5.5,
    currency: "USD",
    transactionDate: "2024-01-15T00:00:00.000Z",
    categoryId: null,
    provider: "syncfy",
    createdAt: "",
    updatedAt: "",
    ...overrides
  } as ProviderImportedTransaction;
}

function renderWorkflow(searchParams = new URLSearchParams()) {
  return renderHook(() => useImportedTransactionsWorkflow({ searchParams }), { wrapper });
}

function mockList(importedTransactions: ProviderImportedTransaction[] = []) {
  server.use(
    http.get(`${API_URL}/transactions/imported`, () =>
      HttpResponse.json({
        importedTransactions,
        total: importedTransactions.length,
        pendingCount: importedTransactions.filter((t) => t.status === "pending").length
      })
    )
  );
}

describe("useImportedTransactionsWorkflow", () => {
  it("seeds the query with a status filter from ?status= when present and valid", () => {
    mockList();
    const { result } = renderWorkflow(new URLSearchParams("status=ignored"));
    expect(result.current.importedQuery.where).toEqual({
      field: "status",
      op: "=",
      value: "ignored"
    });
  });

  it("ignores an invalid ?status= value", () => {
    mockList();
    const { result } = renderWorkflow(new URLSearchParams("status=bogus"));
    expect(result.current.importedQuery.where).toBeUndefined();
  });

  it("isPendingFilter/isIgnoredFilter reflect the fetched rows' statuses", async () => {
    mockList([makeImportedTransaction({ status: "pending" })]);
    const { result } = renderWorkflow();

    await waitFor(() => expect(result.current.importedTransactions).toHaveLength(1));
    expect(result.current.isPendingFilter).toBe(true);
    expect(result.current.isIgnoredFilter).toBe(false);
  });

  it("isPendingFilter/isIgnoredFilter are both false for a mixed-status list", async () => {
    mockList([
      makeImportedTransaction({ id: "pt-1", status: "pending" }),
      makeImportedTransaction({ id: "pt-2", status: "ignored" })
    ]);
    const { result } = renderWorkflow();

    await waitFor(() => expect(result.current.importedTransactions).toHaveLength(2));
    expect(result.current.isPendingFilter).toBe(false);
    expect(result.current.isIgnoredFilter).toBe(false);
  });

  it("updateImportedQuery replaces the query and clears selection", () => {
    mockList();
    const { result } = renderWorkflow();

    act(() => result.current.toggleImportedSelection("pt-1"));
    act(() => result.current.setSelectAllFilteredImported(true));
    act(() => result.current.updateImportedQuery({ where: { field: "amount", op: ">", value: 10 } }));

    expect(result.current.selectedImportedIds).toEqual([]);
    expect(result.current.selectAllFilteredImported).toBe(false);
    expect(result.current.importedQuery.where).toEqual({ field: "amount", op: ">", value: 10 });
  });

  it("toggleImportedSelection adds/removes an id and clears select-all-filtered", () => {
    mockList();
    const { result } = renderWorkflow();

    act(() => result.current.setSelectAllFilteredImported(true));
    act(() => result.current.toggleImportedSelection("pt-1"));

    expect(result.current.selectedImportedIds).toEqual(["pt-1"]);
    expect(result.current.selectAllFilteredImported).toBe(false);

    act(() => result.current.toggleImportedSelection("pt-1"));
    expect(result.current.selectedImportedIds).toEqual([]);
  });

  it("setAllVisibleImportedSelected selects/clears every currently-fetched row", async () => {
    mockList([
      makeImportedTransaction({ id: "pt-1" }),
      makeImportedTransaction({ id: "pt-2" })
    ]);
    const { result } = renderWorkflow();
    await waitFor(() => expect(result.current.importedTransactions).toHaveLength(2));

    act(() => result.current.setAllVisibleImportedSelected(true));
    expect(result.current.selectedImportedIds).toEqual(["pt-1", "pt-2"]);

    act(() => result.current.setAllVisibleImportedSelected(false));
    expect(result.current.selectedImportedIds).toEqual([]);
  });

  it("importOneImportedTransaction is a no-op without a categoryId", async () => {
    mockList();
    let called = false;
    server.use(
      http.post(`${API_URL}/transactions/imported/pt-1/import`, () => {
        called = true;
        return HttpResponse.json({ importedTransaction: makeImportedTransaction() });
      })
    );
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.importOneImportedTransaction(
        makeImportedTransaction({ categoryId: null })
      );
    });

    expect(called).toBe(false);
  });

  it("importOneImportedTransaction imports and clears selection when a category is set", async () => {
    mockList();
    let importedCategoryId: unknown;
    server.use(
      http.post(`${API_URL}/transactions/imported/pt-1/import`, async ({ request }) => {
        importedCategoryId = ((await request.json()) as { categoryId: string }).categoryId;
        return HttpResponse.json({ importedTransaction: makeImportedTransaction() });
      })
    );
    const { result } = renderWorkflow();
    act(() => result.current.toggleImportedSelection("pt-1"));

    await act(async () => {
      await result.current.importOneImportedTransaction(
        makeImportedTransaction({ categoryId: "cat-1" })
      );
    });

    expect(importedCategoryId).toBe("cat-1");
    expect(result.current.selectedImportedIds).toEqual([]);
  });

  it("ignoreImportedTransaction ignores a row and clears selection", async () => {
    mockList();
    let ignored = false;
    server.use(
      http.post(`${API_URL}/transactions/imported/pt-1/ignore`, () => {
        ignored = true;
        return HttpResponse.json({ importedTransaction: makeImportedTransaction({ status: "ignored" }) });
      })
    );
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.ignoreImportedTransaction.mutateAsync("pt-1");
    });

    expect(ignored).toBe(true);
  });

  it("unignoreImportedTransaction reverts a row to pending", async () => {
    mockList();
    let unignored = false;
    server.use(
      http.post(`${API_URL}/transactions/imported/pt-1/unignore`, () => {
        unignored = true;
        return HttpResponse.json({ importedTransaction: makeImportedTransaction({ status: "pending" }) });
      })
    );
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.unignoreImportedTransaction.mutateAsync("pt-1");
    });

    expect(unignored).toBe(true);
  });

  it("batchImportImportedTransactions sends an ids-mode selection by default", async () => {
    mockList();
    let sentBody: unknown;
    server.use(
      http.post(`${API_URL}/transactions/imported/batch-import`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ importedTransactions: [], importedCount: 0, errors: [] });
      })
    );
    const { result } = renderWorkflow();
    act(() => result.current.toggleImportedSelection("pt-1"));
    act(() => result.current.setBatchCategoryId("cat-1"));

    await act(async () => {
      await result.current.batchImportImportedTransactions.mutateAsync();
    });

    expect(sentBody).toMatchObject({
      selection: { mode: "ids", ids: ["pt-1"] },
      categoryId: "cat-1"
    });
    expect(result.current.batchCategoryId).toBe("");
  });

  it("batchImportImportedTransactions sends a filtered-mode selection when select-all-filtered is set", async () => {
    mockList();
    let sentBody: unknown;
    server.use(
      http.post(`${API_URL}/transactions/imported/batch-import`, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ importedTransactions: [], importedCount: 0, errors: [] });
      })
    );
    const { result } = renderWorkflow();
    act(() => result.current.updateImportedQuery({ where: { field: "status", op: "=", value: "pending" } }));
    act(() => result.current.setSelectAllFilteredImported(true));

    await act(async () => {
      await result.current.batchImportImportedTransactions.mutateAsync();
    });

    expect(sentBody).toMatchObject({
      selection: { mode: "filtered", where: { field: "status", op: "=", value: "pending" } }
    });
  });

  it("batchIgnoreImportedTransactions and batchUnignoreImportedTransactions both clear selection on success", async () => {
    mockList();
    server.use(
      http.post(`${API_URL}/transactions/imported/batch-ignore`, () =>
        HttpResponse.json({ ignoredCount: 1, errors: [] })
      ),
      http.post(`${API_URL}/transactions/imported/batch-unignore`, () =>
        HttpResponse.json({ unignoredCount: 1, errors: [] })
      )
    );
    const { result } = renderWorkflow();
    act(() => result.current.toggleImportedSelection("pt-1"));

    await act(async () => {
      await result.current.batchIgnoreImportedTransactions.mutateAsync();
    });
    expect(result.current.selectedImportedIds).toEqual([]);

    act(() => result.current.toggleImportedSelection("pt-2"));
    await act(async () => {
      await result.current.batchUnignoreImportedTransactions.mutateAsync();
    });
    expect(result.current.selectedImportedIds).toEqual([]);
  });

  it("updateImportedCategory updates a row's category", async () => {
    mockList();
    let patchedBody: unknown;
    server.use(
      http.patch(`${API_URL}/transactions/imported/pt-1`, async ({ request }) => {
        patchedBody = await request.json();
        return HttpResponse.json({ importedTransaction: makeImportedTransaction({ categoryId: "cat-1" }) });
      })
    );
    const { result } = renderWorkflow();

    await act(async () => {
      await result.current.updateImportedCategory.mutateAsync({ id: "pt-1", categoryId: "cat-1" });
    });

    expect(patchedBody).toEqual({ categoryId: "cat-1" });
  });
});
