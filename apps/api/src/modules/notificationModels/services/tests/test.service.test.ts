import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../sandbox/runScript.js", () => ({
  acquirePlaygroundSlot: vi.fn(),
  runScript: vi.fn(),
  validateScript: vi.fn()
}));
vi.mock("../read.service.js", () => ({ getOwnedModel: vi.fn(), resolveBindingNames: vi.fn() }));

const { acquirePlaygroundSlot, runScript, validateScript } = await import("../../sandbox/runScript.js");
const { getOwnedModel, resolveBindingNames } = await import("../read.service.js");
const { testModel, validateCode } = await import("../test.service.js");

const slots = [
  { key: "card", kind: "account", label: "Card", required: true },
  { key: "general", kind: "category", label: "General", required: false }
];
const model = { id: "m1", userId: "u1", code: "saved", settings: { k: "v" }, slots, bindings: { card: "a1", general: "c1" } };
const now = new Date("2026-11-13T18:04:11.000Z");
const proposal = { kind: "expense", name: "OXXO", amount: "1234.50", currency: "MXN", account: "card", category: "general" };
const release = vi.fn();

function expectNoWrites() {
  for (const delegate of [prismaMock.transaction, prismaMock.notificationRun, prismaMock.notificationModel] as unknown as Array<Record<string, unknown>>) {
    for (const op of ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]) {
      expect(delegate[op]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  release.mockReset();
  vi.mocked(getOwnedModel).mockResolvedValue(model as never);
  vi.mocked(acquirePlaygroundSlot).mockReturnValue(release);
  vi.mocked(resolveBindingNames).mockResolvedValue({ card: "Plata", general: "Food" });
});

describe("validateCode", () => {
  it("wraps validateScript errors", async () => {
    vi.mocked(validateScript).mockResolvedValue([{ line: 2, col: 1, message: "bad" }]);
    expect(await validateCode("x")).toEqual({ errors: [{ line: 2, col: 1, message: "bad" }] });
  });
});

describe("testModel", () => {
  it("returns 503 without running when the playground is busy", async () => {
    vi.mocked(acquirePlaygroundSlot).mockReturnValue(null);
    await expect(testModel("u1", "m1", { text: "t" }, now)).rejects.toMatchObject({ statusCode: 503 });
    expect(runScript).not.toHaveBeenCalled();
  });

  it("404s for a foreign model before taking a slot", async () => {
    vi.mocked(getOwnedModel).mockRejectedValue(Object.assign(new Error("nf"), { statusCode: 404 }));
    await expect(testModel("u1", "m1", { text: "t" }, now)).rejects.toMatchObject({ statusCode: 404 });
    expect(acquirePlaygroundSlot).not.toHaveBeenCalled();
  });

  it("runs draft code and settings, previews with record names, and writes nothing", async () => {
    vi.mocked(runScript).mockResolvedValue({ kind: "proposal", proposal, stdout: "out" } as never);

    const result = await testModel("u1", "m1", { text: "t", code: "draft", settings: { z: "1" } }, now);

    expect(runScript).toHaveBeenCalledWith({
      code: "draft",
      text: "t",
      ctx: { received_at: now.toISOString(), settings: { z: "1" } }
    });
    expect(result).toMatchObject({
      outcome: "proposal",
      stdout: "out",
      transactionPreview: { name: "OXXO", amount: "1234.50", type: "expense", account: "Plata", category: "Food", date: now.toISOString() }
    });
    expect(result.validationErrors).toBeUndefined();
    expect(release).toHaveBeenCalledOnce();
    expectNoWrites();
  });

  it("falls back to saved code and settings", async () => {
    vi.mocked(runScript).mockResolvedValue({ kind: "skip", reason: "promo", stdout: "" });
    const result = await testModel("u1", "m1", { text: "t" }, now);
    expect(runScript).toHaveBeenCalledWith(expect.objectContaining({ code: "saved", ctx: expect.objectContaining({ settings: { k: "v" } }) }));
    expect(result).toEqual({ outcome: "skip", reason: "promo", stdout: "" });
  });

  it("reports script errors and releases the slot when the run throws", async () => {
    vi.mocked(runScript).mockResolvedValueOnce({ kind: "error", error: { message: "ValueError", line: 7 }, stdout: "" });
    expect(await testModel("u1", "m1", { text: "t" }, now)).toMatchObject({ outcome: "error", error: { message: "ValueError", line: 7 } });

    vi.mocked(runScript).mockRejectedValueOnce(new Error("spawn"));
    await expect(testModel("u1", "m1", { text: "t" }, now)).rejects.toThrow("spawn");
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("reports a malformed proposal as invalid result", async () => {
    vi.mocked(runScript).mockResolvedValue({ kind: "proposal", proposal: { kind: "expense", amount: 5 }, stdout: "" } as never);
    expect(await testModel("u1", "m1", { text: "t" }, now)).toMatchObject({ outcome: "error", error: { message: "invalid result" } });
  });

  it("reports a missing mapping", async () => {
    vi.mocked(getOwnedModel).mockResolvedValue({ ...model, bindings: { card: "a1" } } as never);
    vi.mocked(runScript).mockResolvedValue({ kind: "proposal", proposal, stdout: "" } as never);
    const result = await testModel("u1", "m1", { text: "t" }, now);
    expect(result).toMatchObject({ outcome: "error", error: { message: "mapping_missing:general" } });
    expectNoWrites();
  });

  it("reports transactionSchema problems without failing the test", async () => {
    vi.mocked(runScript).mockResolvedValue({
      kind: "proposal",
      proposal: { kind: "transfer", name: "X", amount: "1", currency: "MXN", account: "card", to_account: "card" },
      stdout: ""
    } as never);
    const result = await testModel("u1", "m1", { text: "t" }, now);
    expect(result.outcome).toBe("proposal");
    expect(result.validationErrors?.length).toBeGreaterThan(0);
  });
});
