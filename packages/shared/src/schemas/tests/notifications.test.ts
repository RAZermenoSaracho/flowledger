import { describe, expect, it } from "vitest";
import { notificationParamsSchema } from "../notifications.js";

describe("notificationParamsSchema", () => {
  it("accepts a non-empty id", () => {
    expect(notificationParamsSchema.safeParse({ id: "notif-1" }).success).toBe(
      true
    );
  });

  it("rejects an empty id", () => {
    expect(notificationParamsSchema.safeParse({ id: "" }).success).toBe(
      false
    );
  });

  it("rejects a missing id", () => {
    expect(notificationParamsSchema.safeParse({}).success).toBe(false);
  });
});
