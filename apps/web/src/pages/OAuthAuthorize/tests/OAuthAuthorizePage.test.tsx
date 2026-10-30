import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { OAuthAuthorizePage } from "../OAuthAuthorizePage";

const API = "http://localhost:4000";

function mockContext(requested: ("read" | "write")[] = ["read"]) {
  server.use(
    http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API}/oauth/authorize/context`, () =>
      HttpResponse.json({
        client: { name: "Claude Code", redirectHost: "localhost" },
        scopes: { requested },
        user: { email: "jane@example.com" }
      })
    )
  );
}

function renderPage(search = "?req=signed") {
  return renderWithProviders(<OAuthAuthorizePage />, { withAuth: true, route: `/oauth/authorize${search}` });
}

afterEach(() => vi.unstubAllGlobals());

describe("OAuthAuthorizePage", () => {
  it("shows the app, signed-in user and read-only permission with 1 month default", async () => {
    mockContext();
    renderPage();

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/Signed in as jane@example.com/)).toBeInTheDocument();
    expect(screen.getByLabelText("Read your accounts, categories and transactions")).toBeDisabled();
    expect(screen.queryByLabelText("Also create and update transactions")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 month")).toBeChecked();
  });

  it("warns on Never lifetime", async () => {
    mockContext();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByLabelText("Never"));
    expect(screen.getByText(/keeps access until you revoke/)).toBeInTheDocument();
  });

  it("sends the decision with allowWrite and redirects the browser", async () => {
    mockContext(["read", "write"]);
    let body: unknown;
    server.use(
      http.post(`${API}/oauth/authorize/decision`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ redirectUrl: "http://localhost:9/cb?code=1" });
      })
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText("Also create and update transactions"));
    await user.click(screen.getByLabelText("1 year"));
    await user.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://localhost:9/cb?code=1"));
    expect(body).toEqual({ req: "signed", approve: true, allowWrite: true, lifetime: "1y" });
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled();
  });

  it("denies without write", async () => {
    mockContext(["read", "write"]);
    let body: { approve?: boolean; allowWrite?: boolean } = {};
    server.use(
      http.post(`${API}/oauth/authorize/decision`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ redirectUrl: "http://localhost:9/cb?error=access_denied" });
      })
    );
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByLabelText("Also create and update transactions"));
    await user.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() => expect(body.approve).toBe(false));
    expect(body.allowWrite).toBe(false);
  });

  it("shows an error for an invalid or expired request", async () => {
    server.use(
      http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
      http.get(`${API}/oauth/authorize/context`, () => HttpResponse.json({ message: "expired" }, { status: 400 }))
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/);
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });

  it("shows an error when req is missing", async () => {
    server.use(http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })));
    renderPage("");
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/);
  });

  it("hides the actions when framed", async () => {
    mockContext();
    vi.stubGlobal("top", {});
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/inside a frame/);
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
  });
});
