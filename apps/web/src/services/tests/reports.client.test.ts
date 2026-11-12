import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { getFinancialOverview } from "../reports.client";

describe("getFinancialOverview", () => {
  it("GETs /reports/financial-overview with the device time zone", async () => {
    let url: URL | undefined;
    server.use(
      http.get("http://localhost:4000/reports/financial-overview", ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ currency: "USD" });
      })
    );
    await getFinancialOverview();
    expect(url?.searchParams.get("timeZone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
