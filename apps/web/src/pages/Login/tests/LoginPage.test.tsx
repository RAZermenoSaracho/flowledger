import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import { LoginPage } from "../LoginPage";

const API_URL = "http://localhost:4000";

function mockRefresh401() {
  server.use(http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })));
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe("LoginPage", () => {
  it("renders the email/password form and a link to register", async () => {
    mockRefresh401();
    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/register"
    );
  });

  it("shows an oauthError from the URL query string on mount", async () => {
    mockRefresh401();
    window.history.pushState({}, "", "/login?oauthError=Access%20denied");

    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(screen.getByText("Access denied")).toBeInTheDocument();

    window.history.pushState({}, "", "/login");
  });

  it("logs in and navigates to the dashboard on success", async () => {
    mockRefresh401();
    server.use(
      http.post(`${API_URL}/auth/login`, () =>
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
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <LoginPage />
        <LocationProbe />
      </>,
      { withAuth: true, route: "/login" }
    );

    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });

  it("shows an error message when login fails", async () => {
    mockRefresh401();
    server.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json({ message: "Invalid credentials" }, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { withAuth: true });

    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Invalid credentials")).toBeInTheDocument());
  });
});
