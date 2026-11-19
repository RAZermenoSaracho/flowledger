import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { refreshHoldings, updateAccountHoldings } from "../accounts.client";

describe("refreshHoldings", () => {
  it("POSTs /accounts/:id/holdings/refresh", async () => {
    let method = "";
    server.use(
      http.post("http://localhost:4000/accounts/a1/holdings/refresh", ({ request }) => {
        method = request.method;
        return HttpResponse.json({ accountId: "a1", holdings: [] });
      })
    );
    await expect(refreshHoldings("a1")).resolves.toMatchObject({ accountId: "a1" });
    expect(method).toBe("POST");
  });
});

describe("updateAccountHoldings", () => {
  const url = "http://localhost:4000/accounts/a1/holdings";
  const changes = { upsert: [], remove: [] };

  it("turns a duplicate_holding 409 into an Error carrying the instrument", async () => {
    const holding = { kind: "stock", code: "AAPL", exchange: "XNGS" };
    server.use(
      http.patch(url, () =>
        HttpResponse.json({ message: "Already there", code: "duplicate_holding", holding }, { status: 409 })
      )
    );
    await expect(updateAccountHoldings("a1", changes)).rejects.toMatchObject({
      message: "Already there",
      duplicateHolding: holding
    });
  });

  it("passes other failures through unchanged", async () => {
    server.use(http.patch(url, () => HttpResponse.json({ message: "Nope" }, { status: 400 })));
    const bad = await updateAccountHoldings("a1", changes).catch((error) => error);
    expect(bad).toMatchObject({ message: "Nope", status: 400 });
    expect(bad.duplicateHolding).toBeUndefined();

    server.use(http.patch(url, () => HttpResponse.json({ message: "Busy" }, { status: 409 })));
    const other = await updateAccountHoldings("a1", changes).catch((error) => error);
    expect(other).toMatchObject({ message: "Busy", status: 409 });
    expect(other.duplicateHolding).toBeUndefined();
  });
});
