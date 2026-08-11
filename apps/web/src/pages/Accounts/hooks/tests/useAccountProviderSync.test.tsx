import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Account, AccountSync } from "../../../../types/accounts.types";
import { useAccountProviderSync } from "../useAccountProviderSync";

const API_URL = "http://localhost:4000";

vi.mock("../../utils/syncfyWidget", () => ({
  openSyncfyWidget: vi.fn()
}));
const { openSyncfyWidget } = await import("../../utils/syncfyWidget");
const openSyncfyWidgetMock = vi.mocked(openSyncfyWidget);

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderProviderSync(defaultCurrency = "USD") {
  return renderHook(() => useAccountProviderSync({ defaultCurrency }), { wrapper });
}

function mockBaseline() {
  server.use(
    http.get(`${API_URL}/providers/connectors`, () => HttpResponse.json({ connectors: [] })),
    http.get(`${API_URL}/providers/accounts`, () => HttpResponse.json({ accounts: [] })),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] }))
  );
}

const originalLocation = window.location;

beforeEach(() => {
  mockBaseline();
  openSyncfyWidgetMock.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign: vi.fn() }
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("useAccountProviderSync", () => {
  it("starts with the form closed and no mode selected", () => {
    const { result } = renderProviderSync();
    expect(result.current.isFormOpen).toBe(false);
    expect(result.current.addMode).toBeNull();
    expect(result.current.currency).toBe("USD");
  });

  it("createAccount resets the form and closes it on success", async () => {
    server.use(
      http.post(`${API_URL}/accounts`, () =>
        HttpResponse.json({
          account: { id: "acc-1", name: "Checking", type: "checking", currency: "USD", initialBalance: 0, isArchived: false, createdAt: "", updatedAt: "" }
        })
      )
    );
    const { result } = renderProviderSync();

    act(() => result.current.setName("Checking"));
    act(() => result.current.setIsFormOpen(true));

    await act(async () => {
      await result.current.createAccount.mutateAsync();
    });

    expect(result.current.name).toBe("");
    expect(result.current.isFormOpen).toBe(false);
  });

  it("startProviderConnection navigates directly when the connection returns a url", async () => {
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        HttpResponse.json({
          connection: { provider: "syncfy", institutionName: "Test Bank", url: "https://example.com/connect" }
        })
      )
    );
    const { result } = renderProviderSync();

    await act(async () => {
      await result.current.startProviderConnection.mutateAsync({ provider: "syncfy" });
    });

    expect(window.location.assign).toHaveBeenCalledWith("https://example.com/connect");
    expect(openSyncfyWidgetMock).not.toHaveBeenCalled();
  });

  it("startProviderConnection opens the Syncfy widget when the connection returns one", async () => {
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        HttpResponse.json({
          connection: {
            provider: "syncfy",
            institutionName: "Test Bank",
            widget: { token: "tok", config: {} }
          }
        })
      )
    );
    openSyncfyWidgetMock.mockResolvedValue({ event: "success", credential: undefined });
    const { result } = renderProviderSync();

    await act(async () => {
      await result.current.startProviderConnection.mutateAsync({ provider: "syncfy" });
    });

    expect(openSyncfyWidgetMock).toHaveBeenCalledWith(
      { token: "tok", config: {} },
      expect.objectContaining({ entrypoint: { type: "connect" } })
    );
  });

  it("sets syncfyWidgetError when opening the widget throws", async () => {
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        HttpResponse.json({
          connection: {
            provider: "syncfy",
            institutionName: "Test Bank",
            widget: { token: "tok", config: {} }
          }
        })
      )
    );
    openSyncfyWidgetMock.mockRejectedValue(new Error("boom"));
    const { result } = renderProviderSync();

    await act(async () => {
      await result.current.startProviderConnection.mutateAsync({ provider: "syncfy" });
    });

    await waitFor(() =>
      expect(result.current.syncfyWidgetError).toBe("Could not load the Syncfy widget.")
    );
  });

  it("toggleProviderAccount adds and removes ids", () => {
    const { result } = renderProviderSync();

    act(() => result.current.toggleProviderAccount("pa-1"));
    expect(result.current.selectedProviderAccountIds).toEqual(["pa-1"]);

    act(() => result.current.toggleProviderAccount("pa-1"));
    expect(result.current.selectedProviderAccountIds).toEqual([]);
  });

  it("confirmProviderAccounts clears selections on success", async () => {
    server.use(
      http.post(`${API_URL}/providers/accounts/confirm`, () =>
        HttpResponse.json({ accounts: [] })
      )
    );
    const { result } = renderProviderSync();

    act(() => result.current.toggleProviderAccount("pa-1"));
    act(() =>
      result.current.setProviderAccountLinkTargets({ "pa-1": "acc-1" })
    );

    await act(async () => {
      await result.current.confirmProviderAccounts.mutateAsync();
    });

    expect(result.current.selectedProviderAccountIds).toEqual([]);
    expect(result.current.providerAccountLinkTargets).toEqual({});
  });

  it("closeForm resets every field", () => {
    const { result } = renderProviderSync();

    act(() => result.current.setName("Checking"));
    act(() => result.current.setAddMode("manual"));
    act(() => result.current.setIsFormOpen(true));
    act(() => result.current.closeForm());

    expect(result.current.name).toBe("");
    expect(result.current.addMode).toBeNull();
    expect(result.current.isFormOpen).toBe(false);
  });

  it("startSyncedCredentialFlow is a no-op when the sync entry is missing a providerCredentialId", () => {
    const { result } = renderProviderSync();
    const account: Account = {
      id: "acc-1",
      name: "Checking",
      type: "checking",
      currency: "USD",
      initialBalance: 0,
      isArchived: false,
      sync: [{ id: "sync-1", provider: "syncfy", providerCredentialId: "", status: "ok" } as AccountSync],
      createdAt: "",
      updatedAt: ""
    };

    act(() => result.current.startSyncedCredentialFlow(account, "sync-1", "credential"));

    expect(result.current.isFormOpen).toBe(false);
  });

  it("startSyncedCredentialFlow opens the form in sync mode and starts the credential flow", async () => {
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        HttpResponse.json({
          connection: { provider: "syncfy", institutionName: "Test Bank", widget: { token: "tok", config: {} } }
        })
      ),
      http.post(`${API_URL}/providers/syncfy/credentials/cred-1/refresh`, () =>
        HttpResponse.json({
          refresh: { status: "ok", importedAccounts: 1, importedTransactions: 2 }
        })
      )
    );
    openSyncfyWidgetMock.mockResolvedValue({ event: "success", credential: undefined });
    const { result } = renderProviderSync();
    const account: Account = {
      id: "acc-1",
      name: "Checking",
      type: "checking",
      currency: "USD",
      initialBalance: 0,
      isArchived: false,
      sync: [
        { id: "sync-1", provider: "syncfy", providerCredentialId: "cred-1", status: "ok" } as AccountSync
      ],
      createdAt: "",
      updatedAt: ""
    };

    act(() => result.current.startSyncedCredentialFlow(account, "sync-1", "credential"));

    expect(result.current.isFormOpen).toBe(true);
    expect(result.current.addMode).toBe("sync");
    expect(result.current.selectedConnectorId).toBe("connector:syncfy");

    await waitFor(() =>
      expect(result.current.resyncMessages["sync-1"]).toMatch(
        /1 account and 2 imported transactions refreshed/
      )
    );
  });

  it("startProviderCredentialFlow records a manual-reconnect message when required", async () => {
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        HttpResponse.json({
          connection: { provider: "syncfy", institutionName: "Test Bank", widget: { token: "tok", config: {} } }
        })
      ),
      http.post(`${API_URL}/providers/syncfy/credentials/cred-1/refresh`, () =>
        HttpResponse.json({
          refresh: {
            status: "failed",
            importedAccounts: 0,
            importedTransactions: 0,
            requiresManualReconnect: true,
            failureReason: "Credentials expired."
          }
        })
      )
    );
    openSyncfyWidgetMock.mockResolvedValue({ event: "closed", credential: undefined });
    const { result } = renderProviderSync();

    await act(async () => {
      await result.current.startProviderCredentialFlow.mutateAsync({
        sync: { id: "sync-1", provider: "syncfy", providerCredentialId: "cred-1", status: "ok" } as AccountSync,
        entrypoint: "credential"
      });
    });

    expect(result.current.resyncMessages["sync-1"]).toBe("Credentials expired.");
  });

  it("startProviderCredentialFlow records a fallback error message on failure", async () => {
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        new HttpResponse(null, { status: 500 })
      )
    );
    const { result } = renderProviderSync();

    await act(async () => {
      try {
        await result.current.startProviderCredentialFlow.mutateAsync({
          sync: { id: "sync-1", provider: "syncfy", providerCredentialId: "cred-1", status: "ok" } as AccountSync,
          entrypoint: "credential"
        });
      } catch {
        // expected: the mutation is asserted via onError's side effect below
      }
    });

    await waitFor(() =>
      expect(result.current.resyncMessages["sync-1"]).toBe(
        "Could not start the Syncfy credential flow."
      )
    );
  });
});
