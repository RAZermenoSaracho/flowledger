import { describe, expect, it } from "vitest";
import { imageExtension } from "../imageExtension.js";

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const gif87Bytes = Buffer.from("GIF87a...");
const gif89Bytes = Buffer.from("GIF89a...");
const webpBytes = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP")
]);

describe("imageExtension", () => {
  it("returns 'png' for PNG bytes claimed as image/png", () => {
    expect(imageExtension(pngBytes, "image/png")).toBe("png");
  });

  it("returns 'jpg' for JPEG bytes claimed as image/jpeg", () => {
    expect(imageExtension(jpegBytes, "image/jpeg")).toBe("jpg");
  });

  it("returns 'gif' for GIF87a bytes claimed as image/gif", () => {
    expect(imageExtension(gif87Bytes, "image/gif")).toBe("gif");
  });

  it("returns 'gif' for GIF89a bytes claimed as image/gif", () => {
    expect(imageExtension(gif89Bytes, "image/gif")).toBe("gif");
  });

  it("returns 'webp' for RIFF/WEBP bytes claimed as image/webp", () => {
    expect(imageExtension(webpBytes, "image/webp")).toBe("webp");
  });

  it("returns null when the claimed contentType doesn't match the actual bytes", () => {
    expect(imageExtension(jpegBytes, "image/png")).toBeNull();
  });

  it("returns null for an unsupported contentType even with otherwise-valid-looking bytes", () => {
    expect(imageExtension(pngBytes, "image/svg+xml")).toBeNull();
  });

  it("returns null for empty/too-short data", () => {
    expect(imageExtension(Buffer.alloc(0), "image/png")).toBeNull();
  });
});
