import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/creditCard.update.service.js", () => ({
  updateBillingPeriodOverride: vi.fn()
}));

const { updateBillingPeriodOverride } = await import("../../services/creditCard.update.service.js");
const { patchBillingPeriod } = await import("../creditCard.update.controller.js");

describe("patchBillingPeriod", () => {
  it("passes the user, account id, period key and body to the service and returns the period", async () => {
    vi.mocked(updateBillingPeriodOverride).mockResolvedValue({ key: "2026-11" } as never);
    const res = mockResponse();

    await patchBillingPeriod(
      mockRequest({ params: { id: "card-1", key: "2026-11" }, body: { closingDate: "2026-11-23" } }),
      res
    );

    expect(updateBillingPeriodOverride).toHaveBeenCalledWith("user-1", "card-1", "2026-11", { closingDate: "2026-11-23" });
    expect(res.json).toHaveBeenCalledWith({ key: "2026-11" });
  });
});
