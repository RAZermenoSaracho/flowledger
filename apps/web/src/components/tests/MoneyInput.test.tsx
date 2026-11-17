import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { MoneyInput } from "../MoneyInput";

const fiat = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" }
];

function Harness({ initialCurrency = "USD" }: { initialCurrency?: string }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(initialCurrency);
  return (
    <MoneyInput
      label="Price"
      amount={amount}
      currency={currency}
      onAmountChange={setAmount}
      onCurrencyChange={setCurrency}
    />
  );
}

function setup(initialCurrency?: string) {
  server.use(
    http.get("http://localhost:4000/currencies", () =>
      HttpResponse.json({ currencies: fiat, fiat, crypto: [] })
    )
  );
  renderWithProviders(<Harness initialCurrency={initialCurrency} />);
}

describe("MoneyInput", () => {
  it("shows the given currency as inline text and types an amount", async () => {
    setup("EUR");
    const user = userEvent.setup();
    const currency = screen.getByRole("combobox", { name: "Price currency" });
    expect(await screen.findByDisplayValue("EUR")).toBe(currency);
    await user.type(screen.getByRole("textbox", { name: "Price" }), "1000.50");
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1000.50");
  });

  it("opens the currency picker by click and changes currency", async () => {
    setup();
    const user = userEvent.setup();
    const currency = await screen.findByRole("combobox", { name: "Price currency" });
    await screen.findByDisplayValue("USD");
    await user.click(currency);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /EUR/ }));
    expect(screen.getByRole("combobox", { name: "Price currency" })).toHaveValue("EUR");
  });

  it("opens the picker from the keyboard and picks with Enter", async () => {
    setup();
    const user = userEvent.setup();
    await screen.findByDisplayValue("USD");
    await user.tab();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Price currency" })).toHaveFocus();
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("eur{Enter}");
    expect(screen.getByRole("combobox", { name: "Price currency" })).toHaveValue("EUR");
  });
});
