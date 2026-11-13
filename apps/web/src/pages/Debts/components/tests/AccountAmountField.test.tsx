import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import type { Account } from "../../../../types/accounts.types";
import { AccountAmountField } from "../AccountAmountField";

const account = (currency: string): Account => ({
  id: "acc",
  name: "Acc",
  type: "checking",
  currency,
  initialBalance: "0",
  isArchived: false,
  createdAt: "",
  updatedAt: ""
});

function Harness({ currency }: { currency: string }) {
  const [value, setValue] = useState("");
  return (
    <AccountAmountField accounts={[account(currency)]} accountId="acc" currency="USD" amount="100" value={value} onChange={setValue} />
  );
}

describe("AccountAmountField", () => {
  it("renders nothing when the account currency matches the settlement currency", () => {
    renderWithProviders(<Harness currency="USD" />);
    expect(screen.queryByLabelText(/Amount in account currency/)).not.toBeInTheDocument();
  });

  it("prefills the rate suggestion and lets the user override it", async () => {
    server.use(http.get("http://localhost:4000/currencies/rate", () => HttpResponse.json({ from: "USD", to: "MXN", rate: 17 })));
    const user = userEvent.setup();
    renderWithProviders(<Harness currency="MXN" />);
    const input = await screen.findByLabelText(/Amount in account currency \(MXN\)/);
    await waitFor(() => expect(input).toHaveValue(1700));
    await user.clear(input);
    await user.type(input, "1690");
    expect(input).toHaveValue(1690);
  });

  it("shows an inline precision error", async () => {
    server.use(http.get("http://localhost:4000/currencies/rate", () => HttpResponse.json({ from: "USD", to: "MXN", rate: 17 })));
    const user = userEvent.setup();
    renderWithProviders(<Harness currency="MXN" />);
    const input = await screen.findByLabelText(/Amount in account currency/);
    await waitFor(() => expect(input).toHaveValue(1700));
    await user.type(input, ".123");
    expect(await screen.findByText(/at most 2 decimal places/)).toBeInTheDocument();
  });
});
