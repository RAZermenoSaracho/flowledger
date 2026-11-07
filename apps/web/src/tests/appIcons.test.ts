import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (name: string) => readFileSync(path.join(process.cwd(), "public", name));

function pngSize(file: Buffer) {
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  return `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`;
}

describe("app icons", () => {
  const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");

  it.each([
    ['rel="icon" href="/favicon.ico"'],
    ['href="/favicon.svg"'],
    ['rel="apple-touch-icon" href="/apple-touch-icon.png"'],
    ['rel="manifest" href="/manifest.webmanifest"']
  ])("declares %s in index.html", (declaration) => {
    expect(html).toContain(declaration);
  });

  it("provides a 180x180 Apple touch icon with no alpha channel", () => {
    const icon = publicFile("apple-touch-icon.png");
    const rgbColorType = 2;
    expect(pngSize(icon)).toBe("180x180");
    expect(icon[25]).toBe(rgbColorType);
  });

  it("provides a 32x32 favicon.ico holding a PNG image", () => {
    const icon = publicFile("favicon.ico");
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon[6]).toBe(32);
    expect(icon[7]).toBe(32);
    expect(pngSize(icon.subarray(icon.readUInt32LE(18)))).toBe("32x32");
  });

  it("lists manifest icons that exist with their declared sizes, including a maskable one", () => {
    const manifest = JSON.parse(publicFile("manifest.webmanifest").toString()) as {
      icons: { src: string; sizes: string; purpose?: string }[];
    };

    for (const icon of manifest.icons) {
      expect(pngSize(publicFile(icon.src.slice(1)))).toBe(icon.sizes);
    }
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"])
    );
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
