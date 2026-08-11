import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { server } from "../../tests/mocks/server";
import type { User } from "../../types/users.types";
import { AuthProvider, useAuth } from "../useAuth";

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

function Consumer() {
  const { user, isInitializing, login, register, logout } = useAuth();
  return (
    <div>
      <span data-testid="initializing">{String(isInitializing)}</span>
      <span data-testid="user-email">{user?.email ?? "none"}</span>
      <button onClick={() => login("jane@example.com", "password123")}>Login</button>
      <button onClick={() => register("Jane Doe", "jane@example.com", "password123")}>
        Register
      </button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    expect(() => render(<Consumer />)).toThrow(
      "useAuth must be used within AuthProvider"
    );
  });

  it("stays signed out when the boot-time refresh has no valid session", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    renderWithProviders(<Consumer />, { withAuth: true });

    expect(screen.getByTestId("initializing")).toHaveTextContent("true");
    await waitFor(() =>
      expect(screen.getByTestId("initializing")).toHaveTextContent("false")
    );
    expect(screen.getByTestId("user-email")).toHaveTextContent("none");
  });

  it("restores the session from the boot-time refresh when one is valid", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({ token: "refreshed-token", user: testUser })
      )
    );

    renderWithProviders(<Consumer />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByTestId("user-email")).toHaveTextContent("jane@example.com")
    );
  });

  it("login sets the user from the login response", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json({ token: "login-token", user: testUser })
      )
    );
    const user = userEvent.setup();

    renderWithProviders(<Consumer />, { withAuth: true });
    await waitFor(() =>
      expect(screen.getByTestId("initializing")).toHaveTextContent("false")
    );
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() =>
      expect(screen.getByTestId("user-email")).toHaveTextContent("jane@example.com")
    );
  });

  it("register sets the user from the register response", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${API_URL}/auth/register`, () =>
        HttpResponse.json({ token: "register-token", user: testUser })
      )
    );
    const user = userEvent.setup();

    renderWithProviders(<Consumer />, { withAuth: true });
    await waitFor(() =>
      expect(screen.getByTestId("initializing")).toHaveTextContent("false")
    );
    await user.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(screen.getByTestId("user-email")).toHaveTextContent("jane@example.com")
    );
  });

  it("logout clears the user", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({ token: "refreshed-token", user: testUser })
      ),
      http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 }))
    );
    const user = userEvent.setup();

    renderWithProviders(<Consumer />, { withAuth: true });
    await waitFor(() =>
      expect(screen.getByTestId("user-email")).toHaveTextContent("jane@example.com")
    );

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(screen.getByTestId("user-email")).toHaveTextContent("none"));
  });
});

describe("AuthProvider export", () => {
  it("is usable directly (not just through renderWithProviders)", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 }))
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("initializing")).toHaveTextContent("false")
    );
  });
});
