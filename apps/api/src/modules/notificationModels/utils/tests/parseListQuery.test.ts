import { describe, expect, it } from "vitest";
import { parseListQuery } from "../parseListQuery.js";

describe("parseListQuery", () => {
  it("returns {} when absent", () => expect(parseListQuery(undefined)).toEqual({}));
  it("decodes a JSON object", () => expect(parseListQuery('{"sort":[]}')).toEqual({ sort: [] }));
  it("rejects invalid JSON and non-objects with 400", () => {
    expect(() => parseListQuery("{")).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => parseListQuery("[]")).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
