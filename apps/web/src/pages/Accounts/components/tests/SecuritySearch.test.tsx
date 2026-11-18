import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { SecuritySearch } from "../SecuritySearch";

const API = "http://localhost:4000";
const rows = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", micCode: "XNGS", country: "US", currency: "USD", type: "stock" },
  { symbol: "AAPU", name: "Apple ETF", exchange: "NYSE Arca", micCode: "ARCX", country: "US", currency: "USD", type: "etf" }
];

function setup(body: Record<string, unknown> = { available: true, results: rows }) {
  server.use(http.get(`${API}/currencies/securities`, () => HttpResponse.json(body)));
  const onSelect = vi.fn();
  const onManual = vi.fn();
  render(<SecuritySearch label="Search" onSelect={onSelect} onManual={onManual} />);
  return { onSelect, onManual, user: userEvent.setup() };
}

describe("SecuritySearch", () => {
  it("renders result rows with listing details", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("combobox", { name: "Search" }), "aap");
    const option = await screen.findByRole("option", { name: /AAPL · Apple Inc/ });
    expect(option).toHaveTextContent("NASDAQ (XNGS) · USD · Stock");
    expect(screen.getByRole("option", { name: /AAPU/ })).toHaveTextContent("ETF");
  });

  it("navigates with the arrow keys and selects with Enter", async () => {
    const { user, onSelect } = setup();
    const input = screen.getByRole("combobox", { name: "Search" });
    await user.type(input, "aap");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1]!.id);
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });

  it("closes on Escape without selecting", async () => {
    const { user, onSelect } = setup();
    const input = screen.getByRole("combobox", { name: "Search" });
    await user.type(input, "aap");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onSelect).not.toHaveBeenCalled();
    expect(input).toHaveValue("aap");
  });

  it("shows the empty state", async () => {
    const { user } = setup({ available: true, results: [] });
    await user.type(screen.getByRole("combobox", { name: "Search" }), "zzz");
    expect(await screen.findByText("No matching stocks or ETFs")).toBeInTheDocument();
  });

  it("shows the unavailable state", async () => {
    const { user } = setup({ available: false, results: [] });
    await user.type(screen.getByRole("combobox", { name: "Search" }), "aap");
    expect(await screen.findByText("Search is unavailable")).toBeInTheDocument();
  });

  it("shows a loading state while searching", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("combobox", { name: "Search" }), "a");
    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });

  it("always offers manual entry", async () => {
    const { user, onManual } = setup();
    await user.click(screen.getByRole("button", { name: "Enter ticker manually" }));
    expect(onManual).toHaveBeenCalledOnce();
  });
});
