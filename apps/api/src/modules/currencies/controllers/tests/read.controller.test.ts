import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getExchangeRate: vi.fn(),
  listCurrencies: vi.fn()
}));

vi.mock("../../providers/twelveData/services/search.service.js", () => ({ searchSecurities: vi.fn() }));

const { searchSecurities } = await import("../../providers/twelveData/services/search.service.js");
const { getExchangeRate, listCurrencies } = await import(
  "../../services/read.service.js"
);
const { getCurrencies, getRate, getSecurities } = await import("../read.controller.js");

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

describe("getSecurities", () => {
  it("returns the search body for the validated query", async () => {
    vi.mocked(searchSecurities).mockResolvedValue({ available: true, results: [] });
    const res = mockResponse();

    await getSecurities(mockRequest({ query: { q: "AAPL" } }), res);

    expect(searchSecurities).toHaveBeenCalledWith("AAPL");
    expect(res.json).toHaveBeenCalledWith({ available: true, results: [] });
  });
});
