import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Debt } from "../../../../types/debts.types";
import { AwaitingAcceptanceTab } from "../AwaitingAcceptanceTab";

const API_URL = "http://localhost:4000";

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "p1",
    userId: "me",
    participantName: "Me",
    currency: "USD",
    shareAmount: "40",
    paidAmount: "0",
    status: "pending",
    acceptance: "proposed",
    sharedExpenseId: "se-1",
    debtorUserId: "me",
    creditorUserId: "owner-1",
    outstandingAmount: "40",
    pendingSettlementAmount: "0",
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "owner-1",
      owner: { id: "owner-1", username: "ana", nickname: null, displayName: "Ana" },
      title: "Dinner",
      totalAmount: "100",
      status: "open",
      participants: [],
      createdAt: "",
      updatedAt: ""
    },
    settlementRequests: [],
    ...overrides
  };
}

function trackCalls() {
  const calls: string[] = [];
  server.use(
    http.post(`${API_URL}/shared-expenses/se-1/accept`, async ({ request }) => {
      calls.push(`accept:${((await request.json()) as { participantId: string }).participantId}`);
      return HttpResponse.json({});
    }),
    http.post(`${API_URL}/shared-expenses/se-1/reject`, async ({ request }) => {
      calls.push(`reject:${((await request.json()) as { participantId: string }).participantId}`);
      return HttpResponse.json({});
    }),
    http.post(`${API_URL}/users/blocks`, async ({ request }) => {
      calls.push(`block:${((await request.json()) as { userId: string }).userId}`);
      return HttpResponse.json({});
    })
  );
  return calls;
}

function renderTab(props: Partial<Parameters<typeof AwaitingAcceptanceTab>[0]> = {}) {
  return renderWithProviders(
    <AwaitingAcceptanceTab
      awaiting={[makeDebt()]}
      rejected={[]}
      viewerUserId="me"
      isLoading={false}
      {...props}
    />
  );
}

describe("AwaitingAcceptanceTab", () => {
  it("shows the owner's public label, the title and the share only", () => {
    renderTab();
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.getByText("Ana (@ana) asks you to cover $40.00")).toBeInTheDocument();
  });

  it("accepts with one request", async () => {
    const calls = trackCalls();
    renderTab();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(calls).toEqual(["accept:p1"]));
  });

  it("answers only the line whose card was clicked when a user has two proposed lines", async () => {
    const calls = trackCalls();
    renderTab({ awaiting: [makeDebt({ id: "p1" }), makeDebt({ id: "p2" })] });
    await userEvent.click(screen.getAllByRole("button", { name: "Accept" })[1]!);
    await waitFor(() => expect(calls).toEqual(["accept:p2"]));
  });

  it("rejects without blocking", async () => {
    const calls = trackCalls();
    renderTab();
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(calls).toEqual(["reject:p1"]));
  });

  it("rejects first and then blocks the owner", async () => {
    const calls = trackCalls();
    renderTab();
    await userEvent.click(screen.getByRole("button", { name: "Reject and block" }));
    await waitFor(() => expect(calls).toEqual(["reject:p1", "block:owner-1"]));
  });

  it("shows the failure and keeps the buttons when a response fails", async () => {
    server.use(
      http.post(`${API_URL}/shared-expenses/se-1/accept`, () =>
        HttpResponse.json({ message: "Share is not awaiting a response" }, { status: 400 })
      )
    );
    renderTab();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Share is not awaiting a response");
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("gives the owner no response buttons, and lists rejected shares", () => {
    renderTab({
      viewerUserId: "owner-1",
      awaiting: [makeDebt({ userId: "u2", user: { id: "u2", username: "sam", nickname: null, displayName: null } })],
      rejected: [
        makeDebt({ id: "p2", acceptance: "rejected", user: { id: "u3", username: "kim", nickname: null, displayName: null } })
      ]
    });
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for their answer.")).toBeInTheDocument();
    expect(screen.getByText("@kim rejected $40.00.")).toBeInTheDocument();
  });

  it("says nothing is waiting for an empty list", () => {
    renderTab({ awaiting: [] });
    expect(screen.getByText("Nothing is waiting for an answer.")).toBeInTheDocument();
  });

  it("reports an invitation that is not in the user's list as not found", () => {
    renderTab({ highlightedSharedExpenseId: "someone-elses" });
    expect(screen.getByRole("alert")).toHaveTextContent("Invitation not found.");
  });

  it("does not report not found while loading or when the invitation is listed", () => {
    renderTab({ highlightedSharedExpenseId: "se-1" });
    expect(screen.queryByText("Invitation not found.")).not.toBeInTheDocument();
    expect(document.getElementById("share-se-1")).toHaveClass("border-pine", "bg-mint");
  });

  it("links only the row title to the Shared Expense view", () => {
    renderTab();
    expect(screen.getByRole("link", { name: "Dinner" })).toHaveAttribute("href", "/debts/shared-expenses/se-1");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("groups rows under Awaiting your response and Rejected, hiding an empty group", () => {
    renderTab({
      awaiting: [],
      rejected: [makeDebt({ id: "p2", sharedExpenseId: "se-2" })]
    });
    expect(screen.getByRole("heading", { name: "Rejected" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Awaiting your response" })).not.toBeInTheDocument();
    renderTab();
    expect(screen.getByRole("heading", { name: "Awaiting your response" })).toBeInTheDocument();
  });

  it("shows loading and load-error states", () => {
    const { unmount } = renderTab({ awaiting: [], isLoading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    unmount();
    renderTab({ awaiting: [], error: "Could not load debts." });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load debts.");
  });

  it("wraps the response buttons so they fit a narrow screen", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Reject and block" }).parentElement).toHaveClass("flex-wrap");
  });
});
