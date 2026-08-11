import { describe, expect, it } from "vitest";
import { extractBaseAsset } from "../extractBaseAsset.js";

describe("extractBaseAsset", () => {
  it("strips a known quote asset suffix", () => {
    expect(extractBaseAsset("BTCUSDT")).toBe("BTC");
    expect(extractBaseAsset("ETHBTC")).toBe("ETH");
  });

  it("checks longer suffixes first to avoid a partial match (BUSD before BTC)", () => {
    expect(extractBaseAsset("XRPBUSD")).toBe("XRP");
  });

  it("returns null when no known quote asset matches", () => {
    expect(extractBaseAsset("UNKNOWNPAIR")).toBeNull();
  });

  it("returns null when the symbol is exactly the quote asset (no base left)", () => {
    expect(extractBaseAsset("BTC")).toBeNull();
  });
});
