import { describe, expect, it } from "vitest";
import { darkPalette } from "../darkPalette";

function channel(hex: string, start: number) {
  return parseInt(hex.slice(start, start + 2), 16);
}

function linear(value: number) {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return (
    0.2126 * linear(channel(hex, 1)) +
    0.7152 * linear(channel(hex, 3)) +
    0.0722 * linear(channel(hex, 5))
  );
}

function contrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("darkPalette", () => {
  it("has no color tint on any step", () => {
    for (const hex of Object.values(darkPalette)) {
      expect(channel(hex, 1)).toBe(channel(hex, 3));
      expect(channel(hex, 3)).toBe(channel(hex, 5));
    }
  });

  it.each([100, 200, 300, 400, 500] as const)("step %i text meets AA on every surface", (step) => {
    for (const surface of [950, 900, 800] as const) {
      expect(contrast(darkPalette[step], darkPalette[surface])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("orders page, card, and raised surfaces from dark to light", () => {
    expect(luminance(darkPalette[950])).toBeLessThan(luminance(darkPalette[900]));
    expect(luminance(darkPalette[900])).toBeLessThan(luminance(darkPalette[800]));
  });
});
