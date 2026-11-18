import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { searchSecurities } from "../currencies.client";

describe("searchSecurities", () => {
  it("GETs /currencies/securities with the query", async () => {
    let q: string | null = null;
    server.use(
      http.get("http://localhost:4000/currencies/securities", ({ request }) => {
        q = new URL(request.url).searchParams.get("q");
        return HttpResponse.json({ available: true, results: [] });
      })
    );
    await expect(searchSecurities("aapl")).resolves.toEqual({ available: true, results: [] });
    expect(q).toBe("aapl");
  });
});
