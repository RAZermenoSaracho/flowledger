import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/creditCard.read.service.js", () => ({
  getCreditCardBilling: vi.fn()
}));

const { getCreditCardBilling } = await import("../../services/creditCard.read.service.js");
const { getCreditCard } = await import("../creditCard.read.controller.js");

describe("getCreditCard", () => {
  it("passes the user, account id and parsed page to the service", async () => {
    vi.mocked(getCreditCardBilling).mockResolvedValue({ accountId: "card-1" } as never);
    const res = mockResponse();

    await getCreditCard(mockRequest({ params: { id: "card-1" }, query: { page: "2" } }), res);

    expect(getCreditCardBilling).toHaveBeenCalledWith("user-1", "card-1", 2);
    expect(res.json).toHaveBeenCalledWith({ accountId: "card-1" });
  });

  it("defaults to page 1", async () => {
    vi.mocked(getCreditCardBilling).mockResolvedValue({} as never);
    await getCreditCard(mockRequest({ params: { id: "card-1" }, query: {} }), mockResponse());
    expect(getCreditCardBilling).toHaveBeenCalledWith("user-1", "card-1", 1);
  });

  it("rejects an invalid page", async () => {
    await expect(
      getCreditCard(mockRequest({ params: { id: "card-1" }, query: { page: "0" } }), mockResponse())
    ).rejects.toThrow();
  });
});
