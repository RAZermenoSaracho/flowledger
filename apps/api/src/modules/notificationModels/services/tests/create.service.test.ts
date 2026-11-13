import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../sandbox/runScript.js", () => ({ validateScript: vi.fn() }));
vi.mock("../read.service.js", () => ({ assertBindingsValid: vi.fn() }));

const { validateScript } = await import("../../sandbox/runScript.js");
const { assertBindingsValid } = await import("../read.service.js");
const { assertActivatable, assertCodeValid, createModel } = await import("../create.service.js");

const slots = [{ key: "card", kind: "account" as const, label: "Card", required: true }];
const input = { name: "Plata", code: "def process(text, ctx): pass", slots, bindings: {}, settings: {}, isActive: false, visibility: "private" as const };

describe("assertCodeValid", () => {
  it("skips empty code, passes valid code and rejects errors with details", async () => {
    vi.mocked(validateScript).mockResolvedValue([]);
    await expect(assertCodeValid("")).resolves.toBeUndefined();
    await expect(assertCodeValid("ok")).resolves.toBeUndefined();

    vi.mocked(validateScript).mockResolvedValue([{ line: 1, col: 0, message: "no import" }]);
    await expect(assertCodeValid("import os")).rejects.toMatchObject({
      statusCode: 400,
      details: { errors: [{ line: 1, col: 0, message: "no import" }] }
    });
  });
});

describe("assertActivatable", () => {
  it("rejects empty code and lists unbound required slots", async () => {
    await expect(assertActivatable({ code: "", slots, bindings: {} }, { checkCode: false })).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertActivatable({ code: "x", slots, bindings: {} }, { checkCode: false })).rejects.toMatchObject({
      statusCode: 400,
      details: { unboundSlots: ["card"] }
    });
    await expect(assertActivatable({ code: "x", slots, bindings: { card: "a" } }, { checkCode: false })).resolves.toBeUndefined();
  });
});

describe("createModel", () => {
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
    await expect(createModel("u1", { ...input, bindings: { ghost: "x" } })).rejects.toMatchObject({ statusCode: 400 });
  });
});
