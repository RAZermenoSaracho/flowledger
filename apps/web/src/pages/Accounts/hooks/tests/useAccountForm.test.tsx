import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import type { Account } from "../../../../types/accounts.types";
import { useAccountForm } from "../useAccountForm";

const API_URL = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const account: Account = {
  id: "acc-1",
  name: "Checking",
  type: "checking",
  identifier: "1234",
  currency: "USD",
  initialBalance: "500",
  isArchived: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
};

describe("useAccountForm", () => {
  it("has an empty draft while the account is loading", () => {
    const { result } = renderHook(() => useAccountForm(null), { wrapper });
    expect(result.current.values).toEqual({});
    expect(result.current.isDirty).toBe(false);
  });

  it("loads values from the account and tracks dirty state", () => {
    const { result } = renderHook(() => useAccountForm(account), { wrapper });
    expect(result.current.values).toEqual({
      name: "Checking",
      type: "checking",
      identifier: "1234",
      currency: "USD",
      initialBalance: "500",
      creditLimit: "",
      statementClosingDay: "",
      paymentDueRule: "",
      paymentDueValue: "",
      billingTimeZone: "",
      annualInterestRate: ""
    });

    act(() => result.current.setField("name", "Everyday"));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.changedKeys).toEqual(["name"]);
  });

  it("blocks save and shows the error when the name is empty", async () => {
    let called = false;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, () => {
        called = true;
        return HttpResponse.json({ account });
      })
    );
    const { result } = renderHook(() => useAccountForm(account), { wrapper });

    act(() => result.current.setField("name", ""));
    await act(() => result.current.save());

    expect(called).toBe(false);
    expect(result.current.fieldErrors.name).toBeTruthy();
  });

  it("saves only the changed fields in one request, blank identifier as null", async () => {
    let body: unknown;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ account });
      })
    );
    const { result } = renderHook(() => useAccountForm(account), { wrapper });

    act(() => {
      result.current.setField("name", "Everyday");
      result.current.setField("identifier", "");
      result.current.setField("initialBalance", "75.5");
    });
    await act(() => result.current.save());

    expect(body).toEqual({
      name: "Everyday",
      identifier: null,
      initialBalance: "75.5"
    });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
  });

  it("keeps the draft and exposes the error when the server rejects", async () => {
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, () =>
        HttpResponse.json({ error: { message: "Nope" } }, { status: 500 })
      )
    );
    const { result } = renderHook(() => useAccountForm(account), { wrapper });

    act(() => result.current.setField("name", "Everyday"));
    await act(() => result.current.save());

    expect(result.current.saveError).toBeTruthy();
    expect(result.current.values.name).toBe("Everyday");
    expect(result.current.isDirty).toBe(true);
  });

  it("coerces numeric card values from the API to strings and saves without throwing", async () => {
    const card = {
      ...account,
      type: "credit_card",
      creditLimit: 48000,
      annualInterestRate: 60
    } as unknown as Account;
    let body: unknown;
    server.use(
      http.put(`${API_URL}/accounts/acc-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ account: card });
      })
    );
    const { result } = renderHook(() => useAccountForm(card), { wrapper });

    expect(result.current.values.creditLimit).toBe("48000");
    expect(result.current.values.annualInterestRate).toBe("60");

    act(() => result.current.setField("name", "Card"));
    await act(() => result.current.save());

    expect(result.current.fieldErrors).toEqual({});
    expect(body).toEqual({ name: "Card" });
  });

  describe("new account", () => {
    const created = { ...account, id: "acc-new", name: "Wallet" };

    function renderNew(onCreated = vi.fn()) {
      const rendered = renderHook(
        () => useAccountForm(null, { currency: "MXN", onCreated }),
        { wrapper }
      );
      return { ...rendered, onCreated };
    }

    it("starts with an empty draft in the given currency", () => {
      const { result } = renderNew();
      expect(result.current.values).toEqual({
        name: "",
        type: "checking",
        identifier: "",
        currency: "MXN",
        initialBalance: "0",
        creditLimit: "",
        statementClosingDay: "",
        paymentDueRule: "",
        paymentDueValue: "",
        billingTimeZone: "",
        annualInterestRate: ""
      });
      expect(result.current.isDirty).toBe(false);
    });

    it("posts a checking account once with no card fields and reports the created account", async () => {
      const bodies: unknown[] = [];
      server.use(
        http.post(`${API_URL}/accounts`, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ account: created }, { status: 201 });
        })
      );
      const { result, onCreated } = renderNew();

      act(() => {
        result.current.setField("name", " Wallet ");
        result.current.setField("initialBalance", "120.5");
      });
      await act(() => result.current.save());

      expect(bodies).toEqual([
        {
          name: "Wallet",
          type: "checking",
          identifier: null,
          currency: "MXN",
          initialBalance: "120.5"
        }
      ]);
      expect(onCreated).toHaveBeenCalledWith(created);
    });

    it("posts the card settings for a credit card", async () => {
      let body: unknown;
      server.use(
        http.post(`${API_URL}/accounts`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ account: created }, { status: 201 });
        })
      );
      const { result } = renderNew();

      act(() => {
        result.current.setField("name", "Visa");
        result.current.setField("type", "credit_card");
        result.current.setField("creditLimit", "48000");
        result.current.setField("statementClosingDay", "15");
        result.current.setField("paymentDueRule", "days_after_closing");
        result.current.setField("paymentDueValue", "20");
        result.current.setField("billingTimeZone", "America/Mexico_City");
        result.current.setField("annualInterestRate", "60");
      });
      await act(() => result.current.save());

      expect(body).toMatchObject({
        type: "credit_card",
        creditLimit: "48000",
        statementClosingDay: 15,
        paymentDueRule: "days_after_closing",
        paymentDueValue: 20,
        billingTimeZone: "America/Mexico_City",
        annualInterestRate: "60"
      });
    });

    it("sends omitted optional card settings as null", async () => {
      let body: unknown;
      server.use(
        http.post(`${API_URL}/accounts`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ account: created }, { status: 201 });
        })
      );
      const { result } = renderNew();

      act(() => {
        result.current.setField("name", "Visa");
        result.current.setField("type", "credit_card");
      });
      await act(() => result.current.save());

      expect(body).toMatchObject({
        creditLimit: null,
        statementClosingDay: null,
        paymentDueRule: null,
        paymentDueValue: null,
        billingTimeZone: null,
        annualInterestRate: null
      });
    });

    it("does not post or call onCreated while the draft is invalid", async () => {
      let posted = false;
      server.use(
        http.post(`${API_URL}/accounts`, () => {
          posted = true;
          return HttpResponse.json({ account: created });
        })
      );
      const { result, onCreated } = renderNew();

      act(() => result.current.setField("identifier", "1234"));
      await act(() => result.current.save());

      expect(posted).toBe(false);
      expect(onCreated).not.toHaveBeenCalled();
      expect(result.current.fieldErrors.name).toBeTruthy();
    });
  });
});
