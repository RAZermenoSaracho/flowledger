import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ApiKeysSection } from "../ApiKeysSection";

const API_URL = "http://localhost:4000";
const key = {
  id: "k1", name: "Laptop", hint: "fl_AbCdE", scopes: ["read"],
  expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, lastUsedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("ApiKeysSection", () => {
  it("lists keys with hint, permissions, expiry and last used", async () => {
    server.use(http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: [key] })));
    renderWithProviders(<ApiKeysSection />);

    expect(await screen.findByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText(/^fl_AbCdE… · Read · Expires .*· Never used/)).toBeInTheDocument();
  });

  it("opens the create dialog focused on Name with defaults, and Cancel closes it without a request", async () => {
    let posted = false;
    server.use(
      http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: [] })),
      http.post(`${API_URL}/users/me/api-keys`, () => {
        posted = true;
        return HttpResponse.json({ apiKey: key, key: "x" }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<ApiKeysSection />);

    expect(await screen.findByText("No API keys yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create API key" }));

    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Read")).toBeChecked();
    expect(screen.getByLabelText("1 month")).toBeChecked();
    await user.click(screen.getByLabelText("Never"));
    expect(screen.getByText(/never expires stays valid/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create API key" }));
    expect(screen.getByLabelText("1 month")).toBeChecked();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("requires a name before creating", async () => {
    server.use(http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: [] })));
    const user = userEvent.setup();
    renderWithProviders(<ApiKeysSection />);
    await user.click(await screen.findByRole("button", { name: "Create API key" }));
    expect(screen.getByLabelText("Name")).toBeRequired();
  });

  it("creates a key, reveals it once, and clears the secret and cache afterwards", async () => {
    let created = false;
    server.use(
      http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: created ? [key] : [] })),
      http.post(`${API_URL}/users/me/api-keys`, () => {
        created = true;
        return HttpResponse.json({ apiKey: key, key: "fl_topsecret" }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ApiKeysSection />);

    await user.click(await screen.findByRole("button", { name: "Create API key" }));
    await user.type(screen.getByLabelText("Name"), "Laptop");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText("fl_topsecret")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain("fl_topsecret");

    await user.click(screen.getByRole("button", { name: "I've saved it" }));
    expect(screen.queryByText("fl_topsecret")).not.toBeInTheDocument();
    expect(await screen.findByText("Laptop")).toBeInTheDocument();
  });

  it("asks for confirmation naming the key before revoking", async () => {
    let revoked = false;
    server.use(
      http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: revoked ? [] : [key] })),
      http.delete(`${API_URL}/users/me/api-keys/k1`, () => {
        revoked = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<ApiKeysSection />);

    await screen.findByText("Laptop");
    await user.click(screen.getAllByRole("button", { name: "Revoke" })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Revoke "Laptop"\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }));

    await waitFor(() => expect(screen.queryByText("Laptop")).not.toBeInTheDocument());
  });
});
