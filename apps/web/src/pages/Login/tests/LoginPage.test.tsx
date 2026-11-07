import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

function LoginWithDestination() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>
  );
}

describe("LoginPage", () => {
  it("renders the email/password form and a link to register", async () => {
    mockRefresh401();
    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
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

    expect(await screen.findByText("Access denied")).toBeInTheDocument();

    window.history.pushState({}, "", "/login");
  });

  it("shows the existing-account Google refusal from the oauthError param", async () => {
    mockRefresh401();
    const message = "An account with this email already exists. Sign in with your password, then connect Google from Profile.";
    window.history.pushState({}, "", `/login?oauthError=${encodeURIComponent(message)}`);

    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(await screen.findByText(message)).toBeInTheDocument();

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
      <LoginWithDestination />,
      { withAuth: true, route: "/login" }
    );

    await user.type(await screen.findByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });

  it.each([
    ["/oauth/authorize?req=abc", "/oauth/authorize"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"]
  ])("after login honours redirect=%s only if same-origin (lands on %s)", async (redirect, expected) => {
    mockRefresh401();
    server.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json({
          token: "tok",
          user: {
            id: "user-1", name: "Jane", email: "jane@example.com", planType: "free",
            mobileSidebarSide: "left", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z"
          }
        })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(
      <LoginWithDestination />,
      { withAuth: true, route: `/login?redirect=${encodeURIComponent(redirect)}` }
    );

    await user.type(await screen.findByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(new RegExp(`^${expected}$`)));
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

    await user.type(await screen.findByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Invalid credentials")).toBeInTheDocument());
  });

  it("has Keep me logged in checked by default", async () => {
    mockRefresh401();
    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(await screen.findByLabelText(/keep me logged in/i)).toBeChecked();
  });

  it("sends keepLoggedIn false when the box is unticked", async () => {
    mockRefresh401();
    let body: unknown;
    server.use(
      http.post(`${API_URL}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: "nope" }, { status: 401 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { withAuth: true });

    await user.type(await screen.findByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByLabelText(/keep me logged in/i));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(body).toMatchObject({ keepLoggedIn: false }));
  });

  describe("Google button", () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...originalLocation, href: "", search: "" }
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    });

    it("reflects the checkbox in the OAuth URL", async () => {
      mockRefresh401();
      const user = userEvent.setup();
      renderWithProviders(<LoginPage />, { withAuth: true });
      const google = await screen.findByRole("button", { name: /continue with google/i });

      await user.click(google);
      expect(window.location.href).toContain("keepLoggedIn=true");

      await user.click(screen.getByLabelText(/keep me logged in/i));
      await user.click(google);
      expect(window.location.href).toContain("keepLoggedIn=false");
    });
  });

  it("redirects a valid session to ?redirect= without rendering the form", async () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, () =>
        HttpResponse.json({
          token: "tok",
          user: {
            id: "user-1", name: "Jane", email: "jane@example.com", planType: "free",
            mobileSidebarSide: "left", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z"
          }
        })
      )
    );
    renderWithProviders(
      <LoginWithDestination />,
      { withAuth: true, route: `/login?redirect=${encodeURIComponent("/transactions")}` }
    );

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/transactions"));
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("does not render the form while the session check is in flight", () => {
    server.use(
      http.post(`${API_URL}/auth/refresh`, async () => {
        await new Promise(() => {});
        return new HttpResponse(null, { status: 401 });
      })
    );
    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("shows the form when the API is failing", async () => {
    server.use(http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 502 })));
    renderWithProviders(<LoginPage />, { withAuth: true });

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  });
});
