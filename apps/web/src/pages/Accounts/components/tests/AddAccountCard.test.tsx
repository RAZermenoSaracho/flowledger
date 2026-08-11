import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useAccountProviderSync } from "../../hooks/useAccountProviderSync";
import { AddAccountCard } from "../AddAccountCard";

const API_URL = "http://localhost:4000";

vi.mock("../../utils/syncfyWidget", () => ({ openSyncfyWidget: vi.fn() }));

function Harness() {
  const sync = useAccountProviderSync({ defaultCurrency: "USD" });
  return (
    <>
      <button onClick={() => sync.setIsFormOpen(true)}>Open form</button>
      <AddAccountCard sync={sync} />
    </>
  );
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

function mockBaseline() {
  server.use(
    http.get(`${API_URL}/providers/connectors`, () =>
      HttpResponse.json({
        connectors: [
          {
            provider: "syncfy",
            connectorId: "conn-1",
            title: "Example Bank",
            description: "Connect via Syncfy",
            country: "US",
            category: "bank",
            coverageLabel: "Popular"
          }
        ]
      })
    ),
    http.get(`${API_URL}/providers/accounts`, () => HttpResponse.json({ accounts: [] })),
    http.get(`${API_URL}/accounts`, () => HttpResponse.json({ accounts: [] }))
  );
}

describe("AddAccountCard", () => {
  it("renders nothing when the form is closed", () => {
    mockBaseline();
    renderHarness();
    expect(screen.queryByText("Add account")).not.toBeInTheDocument();
  });

  it("shows the mode picker when opened with no mode chosen", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));

    expect(screen.getByText("Add account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manual account/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync accounts/ })).toBeInTheDocument();
  });

  it("closes the form via Cancel", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Add account")).not.toBeInTheDocument();
  });

  it("submits the manual-account form", async () => {
    mockBaseline();
    let createdBody: unknown;
    server.use(
      http.post(`${API_URL}/accounts`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json({
          account: { id: "acc-1", name: "Checking", type: "checking", currency: "USD", initialBalance: 0, isArchived: false, createdAt: "", updatedAt: "" }
        });
      })
    );
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Manual account/ }));

    expect(screen.getByText("New manual account")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Checking");
    await user.click(screen.getByRole("button", { name: "Save account" }));

    await waitFor(() => expect(createdBody).toMatchObject({ name: "Checking" }));
  });

  it("goes back to the mode picker from the manual form", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Manual account/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: /Manual account/ })).toBeInTheDocument();
  });

  it("lists connectors in sync mode and starts a connection on click", async () => {
    mockBaseline();
    server.use(
      http.post(`${API_URL}/providers/connections`, () =>
        HttpResponse.json({
          connection: { provider: "syncfy", institutionName: "Example Bank", url: "https://example.com/connect" }
        })
      )
    );
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: vi.fn() }
    });
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Sync accounts/ }));

    await waitFor(() => expect(screen.getByText("Example Bank")).toBeInTheDocument());
    await user.click(screen.getByText("Example Bank").closest("button")!);

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("https://example.com/connect"));

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("shows discovered provider accounts, auto-selected as they arrive", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/providers/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: "pa-1",
              provider: "syncfy",
              name: "Discovered Checking",
              type: "checking",
              currency: "USD",
              balance: 250,
              status: "pending"
            }
          ]
        })
      )
    );
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Sync accounts/ }));

    await waitFor(() => expect(screen.getByText("Discovered Checking")).toBeInTheDocument());
    expect(screen.getByText(/Balance \$250\.00/)).toBeInTheDocument();
    // Newly-discovered provider accounts are auto-selected by the hook, so
    // both the checkbox and the confirm button start already enabled.
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Add selected accounts" })).not.toBeDisabled();

    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("button", { name: "Add selected accounts" })).toBeDisabled();
  });

  it("shows 'No discovered accounts yet.' when the provider list is empty", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Sync accounts/ }));

    await waitFor(() =>
      expect(
        screen.getByText(/No discovered accounts yet\./)
      ).toBeInTheDocument()
    );
  });

  it("confirms selected provider accounts", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/providers/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: "pa-1",
              provider: "syncfy",
              name: "Discovered Checking",
              type: "checking",
              currency: "USD",
              balance: 250,
              status: "pending"
            }
          ]
        })
      ),
      http.post(`${API_URL}/providers/accounts/confirm`, () =>
        HttpResponse.json({ accounts: [] })
      )
    );
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Sync accounts/ }));
    await waitFor(() => expect(screen.getByText("Discovered Checking")).toBeInTheDocument());
    // Already auto-selected by the hook when the provider account arrived.
    expect(screen.getByRole("checkbox")).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add selected accounts" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add selected accounts" })).toBeDisabled()
    );
  });

  it("goes back to the mode picker from sync mode", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.click(screen.getByRole("button", { name: /Sync accounts/ }));
    await waitFor(() => expect(screen.getByText("Example Bank")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: /Manual account/ })).toBeInTheDocument();
  });
});
