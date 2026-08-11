import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
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
  return render(
    <MemoryRouter initialEntries={["/auth/oauth/callback"]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/" element={<div>Dashboard page</div>} />
          <Route path="/transactions" element={<div>Transactions page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("OAuthCallbackPage", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("shows an error when the callback URL has no token", async () => {
    mockRefresh401();
    renderCallback("");

    await waitFor(() =>
      expect(
        screen.getByText("Google authentication did not return a valid session.")
      ).toBeInTheDocument()
    );
  });

  it("exchanges the token for a session and navigates to the dashboard by default", async () => {
    mockRefresh401();
    server.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ user: testUser })));

    renderCallbackWithRoutes("#token=abc123");

    await waitFor(() => expect(screen.getByText("Dashboard page")).toBeInTheDocument());
  });

  it("navigates to an explicit same-origin redirect path", async () => {
    mockRefresh401();
    server.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ user: testUser })));

    renderCallbackWithRoutes("#token=abc123&redirect=%2Ftransactions");

    await waitFor(() => expect(screen.getByText("Transactions page")).toBeInTheDocument());
  });

  it("falls back to the dashboard for a protocol-relative redirect (rejected as unsafe)", async () => {
    mockRefresh401();
    server.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ user: testUser })));

    renderCallbackWithRoutes("#token=abc123&redirect=%2F%2Fevil.com");

    await waitFor(() => expect(screen.getByText("Dashboard page")).toBeInTheDocument());
  });

  it("shows an error and does not navigate when exchanging the token fails", async () => {
    mockRefresh401();
    server.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ message: "Session expired" }, { status: 401 })
      )
    );

    renderCallback("#token=abc123");

    await waitFor(() => expect(screen.getByText("Session expired")).toBeInTheDocument());
  });
});
