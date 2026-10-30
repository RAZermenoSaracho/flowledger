import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OAuthGrant } from "../../../../types/oauth.types";
import { RevokeOAuthGrantDialog } from "../RevokeOAuthGrantDialog";

const grant: OAuthGrant = {
  id: "g1", clientName: "ChatGPT", redirectHost: "chatgpt.com", scopes: ["read"],
  createdAt: "2026-01-01T00:00:00.000Z", expiresAt: null, lastUsedAt: null
};

describe("RevokeOAuthGrantDialog", () => {
  it("names the app and confirms", async () => {
    const onConfirm = vi.fn();
    render(<RevokeOAuthGrantDialog grant={grant} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByText(/Disconnect "ChatGPT"\?/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Disconnect" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(<RevokeOAuthGrantDialog grant={grant} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
