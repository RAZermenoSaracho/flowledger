import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server } from "../../../tests/mocks/server";
import type { Notification } from "../../../types/notifications.types";
import { NotificationsMenu } from "../NotificationsMenu";

const API_URL = "http://localhost:4000";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <NotificationsMenu />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    userId: "user-1",
    type: "shared_expense_added",
    title: "New shared expense",
    message: "Jane split Dinner with you",
    readAt: null,
    metadata: { sharedExpenseId: "se-1" },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockBaseline({
  unreadCount = 0,
  pendingImportedCount = 0,
  notifications = [] as Notification[]
} = {}) {
  server.use(
    http.get(`${API_URL}/notifications/unread-count`, () =>
      HttpResponse.json({ count: unreadCount })
    ),
    http.get(`${API_URL}/transactions/imported/pending-count`, () =>
      HttpResponse.json({ count: pendingImportedCount })
    ),
    http.get(`${API_URL}/notifications`, () => HttpResponse.json({ notifications }))
  );
}

describe("NotificationsMenu", () => {
  it("shows no unread badge and no pending-imported button when both counts are zero", async () => {
    mockBaseline();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    expect(screen.queryByText(/imported pending/)).not.toBeInTheDocument();
  });

  it("shows the unread count badge, capped at '99+'", async () => {
    mockBaseline({ unreadCount: 150 });
    renderMenu();

    await waitFor(() => expect(screen.getByText("99+")).toBeInTheDocument());
  });

  it("shows the pending-imported shortcut and navigates on click", async () => {
    mockBaseline({ pendingImportedCount: 3 });
    const user = userEvent.setup();
    renderMenu();

    const shortcut = await screen.findByRole("button", { name: "3 imported pending" });
    await user.click(shortcut);

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/transactions?tab=imported&status=pending"
    );
  });

  it("opens the dropdown and shows 'No notifications yet.' when the list is empty", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    await waitFor(() => expect(screen.getByText("No notifications yet.")).toBeInTheDocument());
  });

  it("lists notifications once loaded", async () => {
    mockBaseline({ unreadCount: 1, notifications: [makeNotification()] });
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    await waitFor(() => expect(screen.getByText("New shared expense")).toBeInTheDocument());
    expect(screen.getByText("Jane split Dinner with you")).toBeInTheDocument();
  });

  it("disables 'Mark all read' when there are no unread notifications", async () => {
    mockBaseline({ unreadCount: 0, notifications: [makeNotification({ readAt: "2024-01-02T00:00:00.000Z" })] });
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled());
  });

  it("marks all read and refetches the unread count", async () => {
    mockBaseline({ unreadCount: 1, notifications: [makeNotification()] });
    let markedAll = false;
    server.use(
      http.patch(`${API_URL}/notifications/read-all`, () => {
        markedAll = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${API_URL}/notifications/unread-count`, () =>
        HttpResponse.json({ count: markedAll ? 0 : 1 })
      )
    );
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await screen.findByText("New shared expense");

    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(markedAll).toBe(true));
  });

  it("marks a single notification read via its 'Read' button without navigating", async () => {
    mockBaseline({ unreadCount: 1, notifications: [makeNotification()] });
    let readNotificationId: string | undefined;
    server.use(
      http.patch(`${API_URL}/notifications/:id/read`, ({ params }) => {
        readNotificationId = params.id as string;
        return HttpResponse.json({
          notification: makeNotification({ readAt: "2024-01-02T00:00:00.000Z" })
        });
      })
    );
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await screen.findByText("New shared expense");

    await user.click(screen.getByRole("button", { name: "Read" }));

    await waitFor(() => expect(readNotificationId).toBe("n1"));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("clicking a notification marks it read and navigates to its resolved target, closing the menu", async () => {
    mockBaseline({ unreadCount: 1, notifications: [makeNotification()] });
    server.use(
      http.patch(`${API_URL}/notifications/:id/read`, () =>
        HttpResponse.json({
          notification: makeNotification({ readAt: "2024-01-02T00:00:00.000Z" })
        })
      )
    );
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const row = await screen.findByText("New shared expense");
    await user.click(row);

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/debts?tab=sharedExpenses&sharedExpenseId=se-1"
      )
    );
    expect(screen.queryByText("New shared expense")).not.toBeInTheDocument();
  });

  it("closes the dropdown on Escape", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Notifications")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Notifications" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
