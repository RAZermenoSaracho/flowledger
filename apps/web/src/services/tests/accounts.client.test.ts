import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { refreshHoldings } from "../accounts.client";

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
