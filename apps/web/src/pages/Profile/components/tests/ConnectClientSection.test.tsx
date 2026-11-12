import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ConnectClientSection } from "../ConnectClientSection";

const API = "http://localhost:4000";
const MUSE_ID = `${API}/oauth/clients/meta-muse.json`;

function setup() {
  const user = userEvent.setup({ writeToClipboard: false });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  renderWithProviders(<ConnectClientSection />);
  return { user, writeText };
}

describe("ConnectClientSection", () => {
  it("renders the four client tabs with ChatGPT first", () => {
    setup();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "ChatGPT",
      "Claude",
      "Meta AI Muse",
      "Grok"
    ]);
    expect(screen.getByText(/Developer mode/)).toBeInTheDocument();
    expect(screen.getByText(/Permissions: FlowLedger always grants Read/)).toBeInTheDocument();
  });

  it("copies the MCP URL", async () => {
    const { user, writeText } = setup();
    await user.click(screen.getByRole("button", { name: "Copy MCP URL" }));
    expect(writeText).toHaveBeenCalledWith(`${API}/mcp`);
  });

  it("defaults the Claude tab to Web / Desktop with the custom connector steps", async () => {
    const { user, writeText } = setup();
    await user.click(screen.getByRole("tab", { name: "Claude" }));
    expect(screen.getByRole("tab", { name: "Claude Web / Desktop" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Customize → Connectors/)).toBeInTheDocument();
    expect(screen.getByText(/Use Claude's published identity/)).toBeInTheDocument();
    expect(screen.getByText(/"\+" → Connectors/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy MCP URL" }));
    expect(writeText).toHaveBeenCalledWith(`${API}/mcp`);
  });

  it("shows the Claude Code commands under the Claude tab", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Claude" }));
    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(screen.getByText(`claude mcp add --transport http flowledger ${API}/mcp`)).toBeInTheDocument();
    expect(screen.getByText("claude mcp list")).toBeInTheDocument();
    expect(screen.getByText(/--header "Authorization: Bearer fl_\.\.\."/)).toBeInTheDocument();
  });

  it("shows the fetched Muse Client ID and copies it", async () => {
    server.use(http.get(MUSE_ID, () => HttpResponse.json({ client_id: MUSE_ID, client_name: "Meta AI Muse" })));
    const { user, writeText } = setup();
    await user.click(screen.getByRole("tab", { name: "Meta AI Muse" }));
    expect(await screen.findByText(MUSE_ID)).toBeInTheDocument();
    expect(screen.getByText("read write offline_access")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Client ID" }));
    expect(writeText).toHaveBeenCalledWith(MUSE_ID);
  });

  it("shows an unavailable message and no Copy Client ID when the Muse document fails", async () => {
    server.use(http.get(MUSE_ID, () => new HttpResponse(null, { status: 500 })));
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Meta AI Muse" }));
    expect(await screen.findByText(/Client ID unavailable — the API did not return the Muse client document/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Client ID" })).not.toBeInTheDocument();
  });

  it("shows the Grok steps", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Grok" }));
    expect(screen.getByText(/add a custom MCP connector/)).toBeInTheDocument();
    expect(screen.getByText(/no Client ID needed/)).toBeInTheDocument();
  });

  it("moves between subtabs with the arrow keys", async () => {
    const { user } = setup();
    screen.getByRole("tab", { name: "ChatGPT" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Claude" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Claude" })).toHaveAttribute("aria-selected", "true");
  });
});
