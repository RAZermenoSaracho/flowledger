import { describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const updateProfile = vi.fn();
vi.mock("../read.service.js", () => ({ getCurrentUser }));
vi.mock("../update.service.js", () => ({ updateProfile }));

const { updatePreferences } = await import("../preferences.service.js");

describe("updatePreferences", () => {
  it("keeps the current email and name when only the currency changes", async () => {
    getCurrentUser.mockResolvedValue({ name: "Ada", email: "ada@example.com" });
    updateProfile.mockResolvedValue({ id: "u1" });

    await updatePreferences("u1", { preferredCurrency: "MXN" });

    expect(updateProfile).toHaveBeenCalledWith("u1", {
      name: "Ada",
      email: "ada@example.com",
      preferredCurrency: "MXN"
    });
  });

  it("overrides the name and leaves the currency untouched when omitted", async () => {
    getCurrentUser.mockResolvedValue({ name: "Ada", email: "ada@example.com" });

    await updatePreferences("u1", { name: "Grace" });

    expect(updateProfile).toHaveBeenLastCalledWith("u1", {
      name: "Grace",
      email: "ada@example.com",
      preferredCurrency: undefined
    });
  });
});
