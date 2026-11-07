import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../hooks/useAuth";
import { server } from "../../tests/mocks/server";
import { ProtectedRoute } from "../ProtectedRoute";

const API_URL = "http://localhost:4000";

let authOverride: Record<string, unknown> | null = null;

vi.mock("../../hooks/useAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../hooks/useAuth")>();
  return { ...actual, useAuth: () => authOverride ?? actual.useAuth() };
});

function LoginProbe() {
  const location = useLocation();
  return <div>Login page {location.search}</div>;
}

function renderProtected(initial = "/protected") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginProbe />} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>Protected content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProtectedRoute", () => {
  afterEach(() => {
    authOverride = null;
  });

  it("renders nothing while the boot-time session restore is still in flight", () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, async () => {
        await new Promise(() => {});
        return new HttpResponse(null, { status: 401 });
      })
    );

    renderProtected();

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
  });

  it("redirects to /login once initialization settles with no authenticated user", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    renderProtected();

    await waitFor(() => expect(screen.getByText(/Login page/)).toBeInTheDocument());
  });

  it("preserves the full path and query in ?redirect= when sending to login", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    renderProtected("/protected?req=a.b&x=1");

    await waitFor(() =>
      expect(screen.getByText(/Login page/)).toHaveTextContent(
        `?redirect=${encodeURIComponent("/protected?req=a.b&x=1")}`
      )
    );
  });

  it("renders the protected content once a user is restored", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({
          token: "tok",
          user: {
            id: "user-1",
            name: "Jane",
            email: "jane@example.com",
            planType: "free",
            mobileSidebarSide: "left",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        })
      )
    );

    renderProtected();

    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
  });

  it("shows a status message instead of redirecting while the session is unavailable", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 502 }))
    );

    renderProtected();

    expect(await screen.findByRole("status")).toHaveTextContent(/reconnecting/i);
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when a user is present even if the session is flagged unavailable", () => {
    authOverride = { user: { id: "user-1" }, isInitializing: false, isSessionUnavailable: true };

    renderProtected();

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
