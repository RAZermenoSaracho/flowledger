import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useSharedExpenseForm } from "../../hooks/useSharedExpenseForm";
import { SharedExpenseFormCard } from "../SharedExpenseFormCard";

const API_URL = "http://localhost:4000";

function Harness() {
  const form = useSharedExpenseForm();
  return (
    <>
      <button onClick={() => form.setIsFormOpen(true)}>Open form</button>
      <SharedExpenseFormCard form={form} />
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
    http.get(`${API_URL}/transactions`, () =>
      HttpResponse.json({
        data: [{ id: "tx-1", name: "Dinner", type: "expense", amount: 100, executionCurrency: "USD" }],
        meta: {}
      })
    )
  );
}

describe("SharedExpenseFormCard", () => {
  it("renders nothing when the form is closed", () => {
    mockBaseline();
    renderHarness();
    expect(screen.queryByText("New shared expense")).not.toBeInTheDocument();
  });

  it("shows 'New shared expense' with the transaction picker populated", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));

    expect(screen.getByText("New shared expense")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Dinner/ })).toBeInTheDocument()
    );
  });

  it("shows the selected transaction's amount once a transaction is chosen", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await waitFor(() => expect(screen.getByRole("option", { name: /Dinner/ })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Transaction"), "tx-1");

    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("adds a manual participant, enabling submit once at least one exists", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    expect(screen.getByRole("button", { name: "Save split" })).toBeDisabled();

    await user.type(screen.getByLabelText("Manual participant"), "Roommate");
    await user.click(screen.getByRole("button", { name: "Add manual participant" }));

    expect(screen.getByText("Roommate")).toBeInTheDocument();
    expect(screen.getAllByText("Manual participant").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Save split" })).not.toBeDisabled();
  });

  it("removes a participant", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.type(screen.getByLabelText("Manual participant"), "Roommate");
    await user.click(screen.getByRole("button", { name: "Add manual participant" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("Roommate")).not.toBeInTheDocument();
    expect(
      screen.getByText("Add an app user or a manual participant to save the split.")
    ).toBeInTheDocument();
  });

  it("searches app users and adds one from the results", async () => {
    mockBaseline();
    server.use(
      http.get(`${API_URL}/users/search`, () =>
        HttpResponse.json({ users: [{ id: "user-2", name: "Jane", email: "jane@example.com" }] })
      )
    );
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.type(screen.getByLabelText("Find app user"), "jane");

    await waitFor(() => expect(screen.getByText("jane@example.com")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add app user" }));

    expect(screen.getByText(/App user · jane@example.com/)).toBeInTheDocument();
  });

  it("shows 'No app users found.' when the search returns nothing", async () => {
    mockBaseline();
    server.use(http.get(`${API_URL}/users/search`, () => HttpResponse.json({ users: [] })));
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open form" }));
    await user.type(screen.getByLabelText("Find app user"), "nobody");

    await waitFor(() => expect(screen.getByText("No app users found.")).toBeInTheDocument());
  });
});
