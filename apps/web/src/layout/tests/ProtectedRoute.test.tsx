import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../hooks/useAuth";
import { server } from "../../tests/mocks/server";
import { ProtectedRoute } from "../ProtectedRoute";

const API_URL = "http://localhost:4000";

function renderProtected() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/protected"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
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
  it("renders nothing while the boot-time session restore is still in flight", () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, async () => {
        await new Promise(() => {});
        return new HttpResponse(null, { status: 401 });
      })
    );

    renderProtected();

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("redirects to /login once initialization settles with no authenticated user", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    renderProtected();

    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument());
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
});
