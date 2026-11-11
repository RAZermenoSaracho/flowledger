import { describe, expect, it } from "vitest";
import { ApiError } from "../api.client";
import { getFieldError } from "../transactions.client";

describe("getFieldError", () => {
  it("returns the first field-addressed validation error", () => {
    const error = new ApiError("Bad", { issues: { fieldErrors: { amount: ["Too low", "x"] } } }, 400);
    expect(getFieldError(error)).toEqual({ field: "amount", message: "Too low" });
  });

  it("returns null for errors that name no field", () => {
    expect(getFieldError(new ApiError("Bad", { issues: { fieldErrors: {} } }, 400))).toBeNull();
    expect(getFieldError(new ApiError("Bad", undefined, 500))).toBeNull();
    expect(getFieldError(new Error("net"))).toBeNull();
  });
});
