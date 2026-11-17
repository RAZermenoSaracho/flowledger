import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ManualPriceCell } from "../ManualPriceCell";

function Harness({ initial, error }: { initial: string; error?: string }) {
  const [amount, setAmount] = useState(initial);
  const [currency, setCurrency] = useState("USD");
  return (
    <>
      <ManualPriceCell
        name="BTC"
        amount={amount}
        currency={currency}
        error={error}
        onAmountChange={setAmount}
        onCurrencyChange={setCurrency}
      />
      <button>Elsewhere</button>
    </>
  );
}

function setup(initial: string, error?: string) {
  server.use(
    http.get("http://localhost:4000/currencies", () =>
      HttpResponse.json({
        currencies: [],
        fiat: [{ code: "USD", name: "US Dollar" }],
        crypto: []
      })
    )
  );
  renderWithProviders(<Harness initial={initial} error={error} />);
}

describe("ManualPriceCell", () => {
  it("renders text at rest with no input", () => {
    setup("55000");
    expect(
      screen.getByRole("button", { name: "Edit unit price of BTC" })
    ).toHaveTextContent("$55,000.00");
    expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();
  });

  it("starts in edit mode without a price and stays there when blurred empty", async () => {
    setup("");
    const user = userEvent.setup();
    expect(screen.getByLabelText("BTC manual price")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.getByLabelText("BTC manual price")).toBeInTheDocument();
  });

  it("leaves edit mode on Enter, Escape and outside blur, keeping the draft", async () => {
    setup("10");
    const user = userEvent.setup();
    for (const leave of ["{Enter}", "{Escape}"]) {
      await user.click(
        screen.getByRole("button", { name: "Edit unit price of BTC" })
      );
      await user.type(await screen.findByLabelText("BTC manual price"), "5");
      await user.keyboard(leave);
      expect(
        screen.queryByLabelText("BTC manual price")
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Edit unit price of BTC" })
    ).toHaveTextContent("$1,055.00");

    await user.click(
      screen.getByRole("button", { name: "Edit unit price of BTC" })
    );
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByLabelText("BTC manual price")).not.toBeInTheDocument();
  });

  it("returns focus to the price button after Escape", async () => {
    setup("10");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit unit price of BTC" }));
    await user.type(await screen.findByLabelText("BTC manual price"), "{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit unit price of BTC" })).toHaveFocus()
    );
  });

  it("keeps edit mode when Escape only closes the open currency list", async () => {
    setup("10");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit unit price of BTC" }));
    const picker = await screen.findByRole("combobox", { name: "BTC manual price currency" });
    await user.click(picker);
    await waitFor(() => expect(picker).toHaveAttribute("aria-expanded", "true"));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("BTC manual price")).toBeInTheDocument();
  });

  it("shows the error in both modes", () => {
    setup("10", "Too many decimals");
    expect(screen.getByRole("alert")).toHaveTextContent("Too many decimals");
  });
});
