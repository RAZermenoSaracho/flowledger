import { describe, expect, it } from "vitest";
import { safeRedirect } from "../safeRedirect";

describe("safeRedirect", () => {
  it.each([
    ["/", "/"],
    ["/transactions?x=1#h", "/transactions?x=1#h"],
    ["/oauth/authorize?req=abc.def", "/oauth/authorize?req=abc.def"]
  ])("accepts %s", (input, expected) => {
    expect(safeRedirect(input, "/fb")).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\evil.example",
    "javascript:alert(1)",
    "evil",
    "%2F%2Fevil.example",
    "/%5Cevil.example",
    "/%09/evil.example",
    "/\nfoo",
    "%"
  ])("rejects %s", (input) => {
    expect(safeRedirect(input as string | null | undefined, "/fb")).toBe("/fb");
  });

  it("defaults the fallback to /", () => {
    expect(safeRedirect("//x")).toBe("/");
  });
});
