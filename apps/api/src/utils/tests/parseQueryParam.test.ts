import { describe, expect, it } from "vitest";
import { HttpError } from "../httpError.js";
import { parseQueryParam } from "../parseQueryParam.js";

describe("parseQueryParam", () => {
  it("returns {} when absent", () => {
    expect(parseQueryParam(undefined)).toEqual({});
    expect(parseQueryParam("")).toEqual({});
  });

  it("decodes a JSON object", () => {
    expect(parseQueryParam('{"where":{"a":1}}')).toEqual({ where: { a: 1 } });
  });

  it("rejects invalid JSON with a labelled 400", () => {
    const error = (() => {
      try {
        parseQueryParam("{", "groups");
      } catch (e) {
        return e as HttpError;
      }
    })();
    expect(error).toBeInstanceOf(HttpError);
    expect(error?.statusCode).toBe(400);
    expect(error?.message).toBe("Invalid groups query: not valid JSON");
  });

  it.each(["[]", "null", "5", '"x"'])("rejects non-object %s", (raw) => {
    expect(() => parseQueryParam(raw)).toThrow("Invalid query: must be a JSON object");
  });
});
