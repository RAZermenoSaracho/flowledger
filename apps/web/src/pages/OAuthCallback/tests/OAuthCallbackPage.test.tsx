import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AuthProvider } from "../../../hooks/useAuth";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { OAuthCallbackPage } from "../OAuthCallbackPage";

const API_URL = "http://localhost:4000";

const testUser = {
  id: "user-1",
  name: "Jane",
  email: "jane@example.com",
  planType: "free" as const,
  mobileSidebarSide: "left" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

function mockRefresh401() {
  server.use(http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })));
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/** Renders the callback page alone (no matched sibling routes) — for
 * assertions that only need the page's own error/loading state, not
 * where `navigate()` actually lands. */
function renderCallback(hash: string) {
  window.location.hash = hash;
  return renderWithProviders(
    <>
      <OAuthCallbackPage />
      <LocationProbe />
    </>,
    { withAuth: true, route: "/auth/oauth/callback" }
  );
}

/** Renders the callback page inside real matched Routes, so a successful
 * exchange's `navigate()` call resolves to visible page content. */
function renderCallbackWithRoutes(hash: string) {
  window.location.hash = hash;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/auth/oauth/callback"]}>
        <AuthProvider>
          <Routes>
            <Route path="/auth/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/" element={<div>Dashboard page</div>} />
            <Route path="/transactions" element={<div>Transactions page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockRefreshSuccess() {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () =>
      HttpResponse.json({ token: "access-token", user: testUser })
    )
  );
}

describe("OAuthCallbackPage", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("restores the session and navigates to the dashboard by default", async () => {
    mockRefreshSuccess();
    renderCallbackWithRoutes("");

    await waitFor(() => expect(screen.getByText("Dashboard page")).toBeInTheDocument());
  });

  it("navigates to an explicit same-origin destination", async () => {
    mockRefreshSuccess();
    renderCallbackWithRoutes("#redirect=%2Ftransactions");

    await waitFor(() => expect(screen.getByText("Transactions page")).toBeInTheDocument());
  });

  it("falls back to the dashboard for an unsafe destination", async () => {
    mockRefreshSuccess();
    renderCallbackWithRoutes("#redirect=%2F%2Fevil.com");

    await waitFor(() => expect(screen.getByText("Dashboard page")).toBeInTheDocument());
  });

  it("ignores any token in the fragment and never sends it", async () => {
    let authorization: string | null = null;
    server.use(
      http.post(`${API_URL}/auth/refresh`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return new HttpResponse(null, { status: 401 });
      })
    );
    renderCallback("#token=abc123");

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(authorization ?? "").not.toContain("abc123");
  });

  it("shows a sign-in error with a login link when restore is rejected, and cleans the URL", async () => {
    mockRefresh401();
    renderCallback("#redirect=%2Ftransactions");

    await waitFor(() =>
      expect(screen.getByText("Google sign-in didn't finish on this device.")).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute("href", "/login");
    expect(window.location.hash).toBe("");
  });

  it("shows the connection message on a temporary failure, then continues", async () => {
    let attempts = 0;
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => {
        attempts += 1;
        return attempts === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ token: "access-token", user: testUser });
      })
    );
    renderCallbackWithRoutes("");

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Dashboard page")).toBeInTheDocument(), {
      timeout: 15_000
    });
  }, 20_000);

  it("navigates once under StrictMode", async () => {
    mockRefreshSuccess();
    const pushes: string[] = [];
    function CountingDashboard() {
      const location = useLocation();
      pushes.push(location.pathname);
      return <div>Dashboard page</div>;
    }
    const queryClient = new QueryClient();
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/auth/oauth/callback"]}>
            <AuthProvider>
              <Routes>
                <Route path="/auth/oauth/callback" element={<OAuthCallbackPage />} />
                <Route path="/" element={<CountingDashboard />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByText("Dashboard page")).toBeInTheDocument());
    expect(new Set(pushes)).toEqual(new Set(["/"]));
  });
});
