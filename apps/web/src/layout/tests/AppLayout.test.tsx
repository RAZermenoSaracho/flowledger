import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../hooks/useAuth";
import { server } from "../../tests/mocks/server";
import type { User } from "../../types/users.types";
import { AppLayout } from "../AppLayout";

const API_URL = "http://localhost:4000";

const testUser: User = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  planType: "free",
  mobileSidebarSide: "left",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function mockBaseline(user: User | null = testUser) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      user
        ? HttpResponse.json({ token: "tok", user })
        : new HttpResponse(null, { status: 401 })
    ),
    http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${API_URL}/notifications/unread-count`, () => HttpResponse.json({ count: 0 })),
    http.get(`${API_URL}/transactions/imported/pending-count`, () =>
      HttpResponse.json({ count: 0 })
    )
  );
}

function renderLayout(initialEntry = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>Dashboard content</div>} />
              <Route path="/profile" element={<div>Profile content</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AppLayout", () => {
  it("renders the sidebar, header, routed content, and mobile bottom nav", async () => {
    mockBaseline();
    renderLayout();

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile primary actions" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Account.*Jane Doe/s })).toBeInTheDocument()
    );
  });

  it("opens and closes the mobile drawer via the bottom-nav toggle", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderLayout();

    const toggle = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(toggle);

    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toHaveClass("translate-x-0");
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close navigation menu" }));

    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
  });

  it("closes the mobile drawer on Escape", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
  });

  it("closes the mobile drawer and navigates when a drawer link is clicked", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    const dashboardLinks = screen.getAllByRole("link", { name: "Dashboard" });
    const drawerDashboardLink = dashboardLinks.find((link) => drawer.contains(link));

    await user.click(drawerDashboardLink!);

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
  });

  it("positions the mobile drawer on the user's mobileSidebarSide preference", async () => {
    mockBaseline({ ...testUser, mobileSidebarSide: "right" });
    const user = userEvent.setup();
    renderLayout();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Account.*Jane Doe/s })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toHaveClass("right-0");
  });

  it("defaults the mobile drawer to the left when there is no authenticated user yet", async () => {
    mockBaseline(null);
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toHaveClass("left-0");
  });

  it("logs out and navigates to /login when 'Sign out' is clicked", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderLayout();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0)
    );

    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);

    await waitFor(() => {
      expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
    });
  });
});
