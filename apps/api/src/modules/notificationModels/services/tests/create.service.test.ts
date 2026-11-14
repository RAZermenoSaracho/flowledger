import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../sandbox/runScript.js", () => ({ acquirePlaygroundSlot: vi.fn(), validateScript: vi.fn() }));
vi.mock("../read.service.js", () => ({ assertBindingsValid: vi.fn() }));

const { acquirePlaygroundSlot, validateScript } = await import("../../sandbox/runScript.js");
const { assertBindingsValid } = await import("../read.service.js");
const { assertActivatable, assertCodeValid, createModel } = await import("../create.service.js");

const slots = [{ key: "card", kind: "account" as const, label: "Card", required: true }];
const input = { name: "Plata", code: "def process(text, ctx): pass", slots, bindings: {}, settings: {}, isActive: false, visibility: "private" as const };

const release = vi.fn();
beforeEach(() => {
  vi.mocked(acquirePlaygroundSlot).mockReturnValue(release);
});

describe("assertCodeValid", () => {
  it("skips empty code, passes valid code and rejects errors with details", async () => {
    vi.mocked(validateScript).mockResolvedValue([]);
    await expect(assertCodeValid("u1", "")).resolves.toBeUndefined();
    await expect(assertCodeValid("u1", "ok")).resolves.toBeUndefined();

    vi.mocked(validateScript).mockResolvedValue([{ line: 1, col: 0, message: "no import" }]);
    await expect(assertCodeValid("u1", "import os")).rejects.toMatchObject({
      statusCode: 400,
      details: { errors: [{ line: 1, col: 0, message: "no import" }] }
    });
  });
});

describe("assertActivatable", () => {
  it("rejects empty code and lists unbound required slots", async () => {
    await expect(assertActivatable("u1", { code: "", slots, bindings: {} }, { checkCode: false })).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertActivatable("u1", { code: "x", slots, bindings: {} }, { checkCode: false })).rejects.toMatchObject({
      statusCode: 400,
      details: { unboundSlots: ["card"] }
    });
    await expect(assertActivatable("u1", { code: "x", slots, bindings: { card: "a" } }, { checkCode: false })).resolves.toBeUndefined();
  });
});

describe("createModel", () => {
  it("rejects code validation when the playground is busy", async () => {
    vi.mocked(acquirePlaygroundSlot).mockReturnValue(null);
    await expect(createModel("u1", input)).rejects.toMatchObject({
      statusCode: 503, message: "Test playground is busy, try again shortly"
    });
    expect(acquirePlaygroundSlot).toHaveBeenCalledWith("u1");
    expect(validateScript).not.toHaveBeenCalled();
    expect(prismaMock.notificationModel.create).not.toHaveBeenCalled();
  });

  it("releases the validation slot after success, invalid code and sandbox failure", async () => {
    vi.mocked(validateScript).mockResolvedValueOnce([]);
    await createModel("u1", input);
    expect(release).toHaveBeenCalledTimes(1);
    vi.mocked(validateScript).mockResolvedValueOnce([{ line: 1, col: 0, message: "bad" }]);
    await expect(createModel("u1", input)).rejects.toMatchObject({ statusCode: 400 });
    expect(release).toHaveBeenCalledTimes(2);
    vi.mocked(validateScript).mockRejectedValueOnce(new Error("spawn"));
    await expect(createModel("u1", input)).rejects.toThrow("spawn");
    expect(release).toHaveBeenCalledTimes(3);
  });

  it("creates an inactive model owned by the caller", async () => {
    vi.mocked(validateScript).mockResolvedValue([]);
    prismaMock.notificationModel.create.mockResolvedValue({ id: "m1" } as never);

    await createModel("u1", input);

    expect(assertBindingsValid).toHaveBeenCalledWith("u1", slots, {});
    expect(prismaMock.notificationModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", isActive: false, name: "Plata" })
    });
  });

  it("rejects invalid code without writing", async () => {
    vi.mocked(validateScript).mockResolvedValue([{ line: 1, col: 0, message: "bad" }]);
    await expect(createModel("u1", input)).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.notificationModel.create).not.toHaveBeenCalled();
  });

  it("rejects foreign bindings from the ownership check", async () => {
    vi.mocked(validateScript).mockResolvedValue([]);
    vi.mocked(assertBindingsValid).mockRejectedValueOnce(Object.assign(new Error("x"), { statusCode: 400 }));
    await expect(createModel("u1", { ...input, bindings: { card: "foreign" } })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.notificationModel.create).not.toHaveBeenCalled();
  });

  it("rejects activation with an unbound required slot", async () => {
    vi.mocked(validateScript).mockResolvedValue([]);
    await expect(createModel("u1", { ...input, isActive: true })).rejects.toMatchObject({
      statusCode: 400,
      details: { unboundSlots: ["card"] }
    });
  });

  it("rejects bindings for undeclared slots", async () => {
    vi.mocked(validateScript).mockResolvedValue([]);
    vi.mocked(assertBindingsValid).mockRejectedValueOnce(Object.assign(new Error("Invalid bindings for slots: ghost"), {
      statusCode: 400, details: { invalidBindings: ["ghost"] }
    }));
    await expect(createModel("u1", { ...input, bindings: { ghost: "x" } })).rejects.toMatchObject({
      statusCode: 400, message: "Invalid bindings for slots: ghost", details: { invalidBindings: ["ghost"] }
    });
    expect(assertBindingsValid).toHaveBeenCalledWith("u1", slots, { ghost: "x" });
    expect(prismaMock.notificationModel.create).not.toHaveBeenCalled();
  });
});
