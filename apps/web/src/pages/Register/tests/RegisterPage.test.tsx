import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import { RegisterPage } from "../RegisterPage";

const API_URL = "http://localhost:4000";

function mockRefresh401() {
  server.use(http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })));
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe("RegisterPage", () => {
  it("renders the name/email/password form and a link to login", () => {
    mockRefresh401();
    renderWithProviders(<RegisterPage />, { withAuth: true });

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("registers and navigates to the dashboard on success", async () => {
    mockRefresh401();
    server.use(
      http.post(`${API_URL}/auth/register`, () =>
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
        <RegisterPage />
        <LocationProbe />
      </>,
      { withAuth: true, route: "/register" }
    );

    await user.type(screen.getByLabelText("Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });

  it("shows an error message when registration fails", async () => {
    mockRefresh401();
    server.use(
      http.post(`${API_URL}/auth/register`, () =>
        HttpResponse.json({ message: "Email already in use" }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { withAuth: true });

    await user.type(screen.getByLabelText("Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.getByText("Email already in use")).toBeInTheDocument());
  });
});
