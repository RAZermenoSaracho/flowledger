import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiKey } from "../../../../types/apiKeys.types";
import { RevokeApiKeyDialog } from "../RevokeApiKeyDialog";

const apiKey: ApiKey = {
  id: "k1", name: "Laptop", hint: "wxyz", scopes: ["read"],
  expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: "2026-01-01T00:00:00.000Z"
};

describe("RevokeApiKeyDialog", () => {
  it("names the key and confirms", async () => {
    const onConfirm = vi.fn();
    render(<RevokeApiKeyDialog apiKey={apiKey} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByText(/Revoke "Laptop"\?/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Revoke key" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(<RevokeApiKeyDialog apiKey={apiKey} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
