import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL } from "../../tests/profileFixtures";
import { BlockedUsersTab } from "../BlockedUsersTab";

const block = {
  id: "b1",
  createdAt: "2026-01-02T00:00:00.000Z",
  user: { id: "u2", username: "sam", displayName: "Sam" }
};

describe("BlockedUsersTab", () => {
  it("lists blocked users by public identity, never by email", async () => {
    server.use(http.get(`${API_URL}/users/blocks`, () => HttpResponse.json({ blocks: [block] })));
    renderWithProviders(<BlockedUsersTab />);
    expect(await screen.findByText("Sam (@sam)")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("@example.com");
  });

  it("says nobody is blocked for an empty list", async () => {
    server.use(http.get(`${API_URL}/users/blocks`, () => HttpResponse.json({ blocks: [] })));
    renderWithProviders(<BlockedUsersTab />);
    expect(await screen.findByText("You have not blocked anyone.")).toBeInTheDocument();
  });

  it("unblocks immediately on remove and the row disappears", async () => {
    let blocks = [block];
    let deleted = "";
    server.use(
      http.get(`${API_URL}/users/blocks`, () => HttpResponse.json({ blocks })),
      http.delete(`${API_URL}/users/blocks/:userId`, ({ params }) => {
        deleted = String(params.userId);
        blocks = [];
        return new HttpResponse(null, { status: 204 });
      })
    );
    renderWithProviders(<BlockedUsersTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText("Sam (@sam)")).not.toBeInTheDocument());
    expect(deleted).toBe("u2");
  });

  it("shows an error when the list cannot be loaded", async () => {
    server.use(http.get(`${API_URL}/users/blocks`, () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<BlockedUsersTab />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Blocked users could not be loaded.");
  });

  it("shows an error when unblocking fails and keeps the row", async () => {
    server.use(
      http.get(`${API_URL}/users/blocks`, () => HttpResponse.json({ blocks: [block] })),
      http.delete(`${API_URL}/users/blocks/:userId`, () =>
        HttpResponse.json({ message: "Could not unblock" }, { status: 500 })
      )
    );
    renderWithProviders(<BlockedUsersTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Could not unblock")).toBeInTheDocument();
    expect(screen.getByText("Sam (@sam)")).toBeInTheDocument();
  });
});
