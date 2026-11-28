import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { getCreditCardBilling, updateBillingPeriod } from "../creditCard.client";

describe("getCreditCardBilling", () => {
  it("GETs the card's billing with the page", async () => {
    let search = "";
    server.use(
      http.get("http://localhost:4000/accounts/card-1/credit-card", ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({ accountId: "card-1" });
      })
    );
    await expect(getCreditCardBilling("card-1", 2)).resolves.toMatchObject({ accountId: "card-1" });
    expect(search).toBe("?page=2");
  });
});

describe("updateBillingPeriod", () => {
  it("PATCHes the period with the body, keeping null as a reset", async () => {
    let received: unknown;
    let method = "";
    server.use(
      http.patch("http://localhost:4000/accounts/card-1/credit-card/periods/2026-11", async ({ request }) => {
        method = request.method;
        received = await request.json();
        return HttpResponse.json({ key: "2026-11" });
      })
    );
    await expect(updateBillingPeriod("card-1", "2026-11", { closingDate: "2026-11-23", dueDate: null })).resolves.toEqual({
      key: "2026-11"
    });
    expect(method).toBe("PATCH");
    expect(received).toEqual({ closingDate: "2026-11-23", dueDate: null });
  });

  it("rejects with the API message", async () => {
    server.use(
      http.patch("http://localhost:4000/accounts/card-1/credit-card/periods/2026-11", () =>
        HttpResponse.json({ message: "Period 2026-11: overlap" }, { status: 400 })
      )
    );
    await expect(updateBillingPeriod("card-1", "2026-11", { closingDate: "2026-10-01" })).rejects.toMatchObject({
      message: "Period 2026-11: overlap",
      status: 400
    });
  });
});
