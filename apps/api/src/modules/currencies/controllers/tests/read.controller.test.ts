import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getExchangeRate: vi.fn(),
  listCurrencies: vi.fn()
}));

const { getExchangeRate, listCurrencies } = await import(
  "../../services/read.service.js"
);
const { getCurrencies, getRate } = await import("../read.controller.js");

describe("getCurrencies", () => {
  it("returns the fiat/crypto currency lists", async () => {
    vi.mocked(listCurrencies).mockResolvedValue({
      currencies: [],
      fiat: [],
      crypto: []
    });
    const res = mockResponse();

    await getCurrencies(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith({ currencies: [], fiat: [], crypto: [] });
  });
});

describe("getRate", () => {
  it("returns the live exchange rate for the requested pair", async () => {
    vi.mocked(getExchangeRate).mockResolvedValue(17.5);
    const res = mockResponse();

    await getRate(mockRequest({ query: { from: "USD", to: "MXN" } }), res);

    expect(getExchangeRate).toHaveBeenCalledWith("USD", "MXN");
    expect(res.json).toHaveBeenCalledWith({ from: "USD", to: "MXN", rate: 17.5 });
  });
});
