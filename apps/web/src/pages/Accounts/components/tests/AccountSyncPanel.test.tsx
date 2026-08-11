import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account, AccountSync } from "../../../../types/accounts.types";
import { AccountSyncPanel } from "../AccountSyncPanel";

function makeSync(overrides: Partial<AccountSync> = {}): AccountSync {
  return {
    id: "sync-1",
    provider: "syncfy",
    providerCredentialId: "cred-1",
    providerAccountId: "pa-1",
    institutionName: "Test Bank",
    accountName: "Checking",
    accountType: "checking",
    currency: "USD",
    externalBalance: 500,
    status: "active",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Checking",
    type: "checking",
    currency: "USD",
    initialBalance: 0,
    isArchived: false,
    source: "synced",
    sync: [makeSync()],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

function baseProps(overrides: Partial<Parameters<typeof AccountSyncPanel>[0]> = {}) {
  return {
    account: makeAccount(),
    resyncMessages: {},
    isStartingCredentialFlow: false,
    onResync: vi.fn(),
    onReconnect: vi.fn(),
    hasCredentialFlowError: false,
    ...overrides
  };
}

describe("AccountSyncPanel", () => {
  it("renders nothing for a manual (non-synced) account", () => {
    const { container } = renderWithProviders(
      <AccountSyncPanel {...baseProps({ account: makeAccount({ source: "manual", sync: [] }) })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a synced account has no sync entries", () => {
    const { container } = renderWithProviders(
      <AccountSyncPanel {...baseProps({ account: makeAccount({ sync: [] }) })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders provider, status, and metadata line", () => {
    renderWithProviders(<AccountSyncPanel {...baseProps()} />);
    expect(screen.getByText("syncfy")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText(/Test Bank · Checking · checking · USD/)).toBeInTheDocument();
  });

  it("shows a 'Reconnect required' badge when requiresManualReconnect is set", () => {
    renderWithProviders(
      <AccountSyncPanel
        {...baseProps({ account: makeAccount({ sync: [makeSync({ requiresManualReconnect: true })] }) })}
      />
    );
    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
  });

  it("shows 'Provider metadata unavailable' when all metadata fields are empty", () => {
    renderWithProviders(
      <AccountSyncPanel
        {...baseProps({
          account: makeAccount({
            sync: [
              makeSync({
                institutionName: null,
                accountName: null,
                accountType: null,
                currency: null
              })
            ]
          })
        })}
      />
    );
    expect(screen.getByText("Provider metadata unavailable")).toBeInTheDocument();
  });

  it("shows 'Unavailable' for a missing external balance", () => {
    renderWithProviders(
      <AccountSyncPanel
        {...baseProps({ account: makeAccount({ sync: [makeSync({ externalBalance: null })] }) })}
      />
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("shows a failureReason line when present", () => {
    renderWithProviders(
      <AccountSyncPanel
        {...baseProps({
          account: makeAccount({ sync: [makeSync({ failureReason: "Connection lost" })] })
        })}
      />
    );
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
  });

  it("shows a resync message, styled as an error when requiresManualReconnect", () => {
    renderWithProviders(
      <AccountSyncPanel
        {...baseProps({
          account: makeAccount({ sync: [makeSync({ requiresManualReconnect: true })] }),
          resyncMessages: { "sync-1": "Manual reconnect needed" }
        })}
      />
    );
    expect(screen.getByText("Manual reconnect needed")).toHaveClass("text-coral");
  });

  it("calls onResync/onReconnect with the sync id", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithProviders(<AccountSyncPanel {...props} />);

    await user.click(screen.getByRole("button", { name: "Resync" }));
    expect(props.onResync).toHaveBeenCalledWith("sync-1");

    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(props.onReconnect).toHaveBeenCalledWith("sync-1");
  });

  it("disables Resync/Reconnect while a credential flow is starting or the account is archived", () => {
    renderWithProviders(
      <AccountSyncPanel {...baseProps({ isStartingCredentialFlow: true })} />
    );
    expect(screen.getByRole("button", { name: "Resync" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeDisabled();
  });

  it("disables Reconnect when the sync has no providerCredentialId", () => {
    renderWithProviders(
      <AccountSyncPanel
        {...baseProps({
          account: makeAccount({ sync: [makeSync({ providerCredentialId: "" })] })
        })}
      />
    );
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeDisabled();
  });

  it("shows the credential-flow error message when hasCredentialFlowError is true", () => {
    renderWithProviders(<AccountSyncPanel {...baseProps({ hasCredentialFlowError: true })} />);
    expect(
      screen.getByText("Could not start the selected Syncfy credential flow.")
    ).toBeInTheDocument();
  });
});
