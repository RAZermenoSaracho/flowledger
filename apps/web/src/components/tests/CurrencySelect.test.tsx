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

describe("CurrencySelect", () => {
  it("shows a loading placeholder while the currency list is being fetched", () => {
    server.use(
      http.get(`${API_URL}/currencies`, async () => {
        await new Promise(() => {});
        return HttpResponse.json({ currencies: [], fiat: [], crypto: [] });
      })
    );

    renderWithProviders(<CurrencySelect label="Currency" value="" onChange={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Loading currencies..." })).toBeInTheDocument();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
  });

  it("renders fiat and crypto currencies grouped once loaded", async () => {
    server.use(
      http.get(`${API_URL}/currencies`, () =>
        HttpResponse.json({ currencies: [...fiat, ...crypto], fiat, crypto })
      )
    );

    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("Currency")).not.toBeDisabled());
    expect(screen.getByRole("option", { name: "USD — US Dollar" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "BTC" })).toBeInTheDocument();
  });

  it("shows a 'No preference' option when allowNoPreference is set", async () => {
    server.use(
      http.get(`${API_URL}/currencies`, () => HttpResponse.json({ currencies: fiat, fiat, crypto: [] }))
    );

    renderWithProviders(
      <CurrencySelect label="Currency" value="" onChange={vi.fn()} allowNoPreference />
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "No preference" })).toBeInTheDocument()
    );
  });

  it("shows an error placeholder and disables the select when the fetch fails", async () => {
    server.use(
      http.get(`${API_URL}/currencies`, () => new HttpResponse(null, { status: 500 }))
    );

    renderWithProviders(<CurrencySelect label="Currency" value="" onChange={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Could not load currencies" })).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Currency")).toBeDisabled();
  });

  it("calls onChange when a different currency is selected", async () => {
    server.use(
      http.get(`${API_URL}/currencies`, () =>
        HttpResponse.json({ currencies: [...fiat, ...crypto], fiat, crypto })
      )
    );
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithProviders(<CurrencySelect label="Currency" value="USD" onChange={onChange} />);

    await waitFor(() => expect(screen.getByLabelText("Currency")).not.toBeDisabled());
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");

    expect(onChange).toHaveBeenCalledWith("EUR");
  });

  it("stays disabled when the disabled prop is set even after loading", async () => {
    server.use(
      http.get(`${API_URL}/currencies`, () => HttpResponse.json({ currencies: fiat, fiat, crypto: [] }))
    );

    renderWithProviders(
      <CurrencySelect label="Currency" value="" onChange={vi.fn()} disabled />
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "USD — US Dollar" })).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Currency")).toBeDisabled();
  });
});
