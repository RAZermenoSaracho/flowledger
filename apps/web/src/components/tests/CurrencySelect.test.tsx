import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { server } from "../../tests/mocks/server";
import { CurrencySelect } from "../CurrencySelect";

const API_URL = "http://localhost:4000";

const fiat = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" }
];
const crypto = [{ code: "BTC", name: "Bitcoin" }];

function manyCryptoCurrencies(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    code: `TOK${index}`,
    name: `Token ${index}`
  }));
}

function mockCurrencies() {
  server.use(
    http.get(`${API_URL}/currencies`, () =>
      HttpResponse.json({ currencies: [...fiat, ...crypto], fiat, crypto })
    )
  );
}

describe("CurrencySelect", () => {
  it("shows a loading placeholder while the currency list is being fetched", () => {
    server.use(
      http.get(`${API_URL}/currencies`, async () => {
        await new Promise(() => {});
        return HttpResponse.json({ currencies: [], fiat: [], crypto: [] });
      })
    );

    renderWithProviders(<CurrencySelect label="Currency" value="" onChange={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue("Loading currencies...");
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
  });

  it("shows the selected currency's formatted label when closed", async () => {
    mockCurrencies();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue("USD — US Dollar");
  });

  it("opens the listbox with fiat and crypto grouped, on focus", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));

    expect(screen.getByRole("option", { name: "USD — US Dollar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EUR — Euro" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "BTC" })).toBeInTheDocument();
    expect(screen.getByText("Fiat currencies")).toBeInTheDocument();
    expect(screen.getByText("Crypto assets")).toBeInTheDocument();
  });

  it("filters options by typing a currency code", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.type(screen.getByRole("combobox", { name: "Currency" }), "btc");

    expect(screen.getByRole("option", { name: "BTC" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "USD — US Dollar" })).not.toBeInTheDocument();
  });

  it("filters fiat options by typing part of the currency name", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.type(screen.getByRole("combobox", { name: "Currency" }), "euro");

    expect(screen.getByRole("option", { name: "EUR — Euro" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "USD — US Dollar" })).not.toBeInTheDocument();
  });

  it("shows 'No matching currencies' when the search has no results", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.type(screen.getByRole("combobox", { name: "Currency" }), "zzz");

    expect(screen.getByText("No matching currencies")).toBeInTheDocument();
  });

  it("shows a 'No preference' option when allowNoPreference is set and the search is empty", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    renderWithProviders(
      <CurrencySelect label="Currency" value="" onChange={vi.fn()} allowNoPreference />
    );

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));

    expect(screen.getByRole("option", { name: "No preference" })).toBeInTheDocument();
  });

  it("shows an error placeholder and disables the input when the fetch fails", async () => {
    server.use(
      http.get(`${API_URL}/currencies`, () => new HttpResponse(null, { status: 500 }))
    );

    renderWithProviders(<CurrencySelect label="Currency" value="" onChange={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue("Could not load currencies")
    );
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
  });

  it("calls onChange and closes the listbox when an option is clicked", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(screen.getByRole("option", { name: "EUR — Euro" }));

    expect(onChange).toHaveBeenCalledWith("EUR");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects the highlighted option via ArrowDown + Enter", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("EUR");
  });

  it("closes on Escape without calling onChange, reverting to the current value", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.type(screen.getByRole("combobox", { name: "Currency" }), "eur");
    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue("USD — US Dollar");
  });

  it("closes on an outside click without calling onChange", async () => {
    mockCurrencies();
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <>
        <CurrencySelect label="Currency" value="USD" onChange={onChange} />
        <button type="button">Elsewhere</button>
      </>
    );

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue("USD — US Dollar");
  });

  it("stays disabled when the disabled prop is set even after loading", async () => {
    mockCurrencies();
    renderWithProviders(
      <CurrencySelect label="Currency" value="" onChange={vi.fn()} disabled />
    );

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled());
  });

  it("caps the rendered option list and shows how many more matches exist", async () => {
    const manyTokens = manyCryptoCurrencies(80);
    server.use(
      http.get(`${API_URL}/currencies`, () =>
        HttpResponse.json({
          currencies: [...fiat, ...manyTokens],
          fiat,
          crypto: manyTokens
        })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Currency" })).not.toBeDisabled());
    await user.click(screen.getByRole("combobox", { name: "Currency" }));

    // 2 fiat + 80 crypto = 82 total matches, capped at 50 rendered.
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(screen.getByText("32 more matches — keep typing to narrow it down")).toBeInTheDocument();
  });
});
