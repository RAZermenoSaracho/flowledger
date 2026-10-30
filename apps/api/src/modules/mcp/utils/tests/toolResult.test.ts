import { ParseError } from "datasieve";
import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError } from "../../../../utils/httpError.js";
import { fail, ok } from "../toolResult.js";

afterEach(() => vi.restoreAllMocks());

describe("ok", () => {
  it("returns identical structured content and JSON text, converting Decimals", () => {
    const result = ok({ amount: new Prisma.Decimal("12.5") });
    expect(result.structuredContent).toEqual({ amount: 12.5 });
    expect(result.content).toEqual([{ type: "text", text: '{"amount":12.5}' }]);
    expect(result.isError).toBeUndefined();
  });
});

describe("fail", () => {
  it("passes an HttpError message through", () => {
    const result = fail(new HttpError(404, "Transaction not found"));
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "Transaction not found" }]
    });
  });

  it("describes a ZodError as validation failure", () => {
    const error = z.object({ a: z.string() }).safeParse({}).error!;
    const result = fail(error);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/^Validation failed:/);
  });

  it("passes datasieve ParseError messages through", () => {
    const result = fail(new ParseError("bad query", []));
    expect((result.content[0] as { text: string }).text).toBe("bad query");
  });

  it("hides and logs unexpected errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = fail(new Error("db password leaked"));
    expect((result.content[0] as { text: string }).text).toBe("Internal error");
    expect(spy).toHaveBeenCalled();
  });
});
