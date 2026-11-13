import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../create.service.js", () => ({ assertActivatable: vi.fn(), assertCodeValid: vi.fn() }));
vi.mock("../read.service.js", () => ({ assertBindingsValid: vi.fn(), getOwnedModel: vi.fn() }));

const { assertActivatable, assertCodeValid } = await import("../create.service.js");
const { assertBindingsValid, getOwnedModel } = await import("../read.service.js");
const { updateModel } = await import("../update.service.js");

const slots = [{ key: "card", kind: "account", label: "Card", required: true }];
const current = { id: "m1", userId: "u1", code: "old", slots, bindings: { card: "a1" }, isActive: false };

beforeEach(() => {
  vi.mocked(getOwnedModel).mockResolvedValue(current as never);
  prismaMock.notificationModel.update.mockResolvedValue({ id: "m1" } as never);
});

describe("updateModel", () => {
  it("propagates 404 for a foreign model without writing", async () => {
    vi.mocked(getOwnedModel).mockRejectedValue(Object.assign(new Error("nf"), { statusCode: 404 }));
    await expect(updateModel("u1", "m1", { name: "x" })).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.notificationModel.update).not.toHaveBeenCalled();
  });

  it("writes only the provided fields", async () => {
    await updateModel("u1", "m1", { name: "New" });
    expect(prismaMock.notificationModel.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { name: "New" } });
    expect(assertCodeValid).not.toHaveBeenCalled();
    expect(assertActivatable).not.toHaveBeenCalled();
  });

  it("validates changed code and re-checks bindings when bindings change", async () => {
    await updateModel("u1", "m1", { code: "new", bindings: { card: "a2" } });
    expect(assertCodeValid).toHaveBeenCalledWith("new");
    expect(assertBindingsValid).toHaveBeenCalledWith("u1", slots, { card: "a2" });
  });

  it("applies the activation rule when activating, validating the saved code", async () => {
    await updateModel("u1", "m1", { isActive: true });
    expect(assertActivatable).toHaveBeenCalledWith(
      expect.objectContaining({ code: "old", isActive: true }),
      { checkCode: true }
    );
  });

  it("re-applies the activation rule to slot or binding changes on an active model", async () => {
    vi.mocked(getOwnedModel).mockResolvedValue({ ...current, isActive: true } as never);
    await updateModel("u1", "m1", { bindings: {} });
    expect(assertActivatable).toHaveBeenCalledWith(expect.objectContaining({ bindings: {} }), { checkCode: false });
  });

  it("does not write when the activation rule fails", async () => {
    vi.mocked(assertActivatable).mockRejectedValueOnce(Object.assign(new Error("unbound"), { statusCode: 400 }));
    await expect(updateModel("u1", "m1", { isActive: true })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.notificationModel.update).not.toHaveBeenCalled();
  });
});
