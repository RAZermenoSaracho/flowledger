import { describe, expect, it } from "vitest";
import { boundedPagination, MAX_TRANSACTION_PAGE_SIZE } from "../boundedPagination.js";

describe("boundedPagination", () => {
  it("defaults to the first maximum-sized page", () => {
    expect(boundedPagination(undefined)).toEqual({
      kind: "offset",
      page: 1,
      pageSize: MAX_TRANSACTION_PAGE_SIZE
    });
  });

  it("passes a requested pagination through unchanged", () => {
    const atMax = { kind: "offset" as const, page: 2, pageSize: MAX_TRANSACTION_PAGE_SIZE };
    const small = { kind: "offset" as const, page: 1, pageSize: 5 };

    expect(boundedPagination(atMax)).toEqual(atMax);
    expect(boundedPagination(small)).toEqual(small);
  });
});
