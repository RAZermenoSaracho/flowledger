import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../sandbox/runScript.js", () => ({
  acquirePlaygroundSlot: vi.fn(),
  parseRules: vi.fn(),
  runScript: vi.fn(),
  validateScript: vi.fn()
}));
vi.mock("../../../transactions/utils/transactionCurrency.js", () => ({ resolveTransactionCurrencyFields: vi.fn() }));
vi.mock("../read.service.js", () => ({ getOwnedModel: vi.fn(), resolveBindingNames: vi.fn() }));

const { acquirePlaygroundSlot, parseRules, runScript, validateScript } = await import("../../sandbox/runScript.js");
const { getOwnedModel, resolveBindingNames } = await import("../read.service.js");
const { resolveTransactionCurrencyFields } = await import("../../../transactions/utils/transactionCurrency.js");
const { HttpError } = await import("../../../../utils/httpError.js");
const { parseCodeToRules, testModel, validateCode } = await import("../test.service.js");

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
  vi.mocked(resolveTransactionCurrencyFields).mockResolvedValue({} as never);
  prismaMock.category.findFirst.mockResolvedValue({ id: "c1" } as never);
  prismaMock.account.findFirst.mockResolvedValue({ id: "a1", currency: "MXN" } as never);
  prismaMock.account.findMany.mockResolvedValue([{ id: "a1", currency: "MXN" }] as never);
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: "EUR" } as never);
});

describe("validateCode", () => {
  it("returns 503 without validating when the playground is busy", async () => {
    vi.mocked(acquirePlaygroundSlot).mockReturnValue(null);
    await expect(validateCode("u1", "x")).rejects.toMatchObject({
      statusCode: 503, message: "Test playground is busy, try again shortly"
    });
    expect(acquirePlaygroundSlot).toHaveBeenCalledWith("u1");
    expect(validateScript).not.toHaveBeenCalled();
  });

  it("releases the slot after success and sandbox failure", async () => {
    vi.mocked(validateScript).mockResolvedValueOnce([]);
    await expect(validateCode("u1", "x")).resolves.toEqual({ errors: [] });
    expect(release).toHaveBeenCalledTimes(1);
    vi.mocked(validateScript).mockRejectedValueOnce(new Error("spawn"));
    await expect(validateCode("u1", "x")).rejects.toThrow("spawn");
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("wraps validateScript errors", async () => {
    vi.mocked(validateScript).mockResolvedValue([{ line: 2, col: 1, message: "bad" }]);
    expect(await validateCode("u1", "x")).toEqual({ errors: [{ line: 2, col: 1, message: "bad" }] });
    expect(release).toHaveBeenCalledOnce();
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
    expect(await testModel("u1", "m1", { text: "t" }, now)).toMatchObject({ outcome: "error", error: { message: expect.stringMatching(/^invalid result: (amount|name): /) } });
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

describe("testModel optional fields and currency", () => {
  const run = async (p: object, over: object = {}) => {
    vi.mocked(getOwnedModel).mockResolvedValue({ ...model, ...over } as never);
    vi.mocked(runScript).mockResolvedValue({ kind: "proposal", proposal: p, stdout: "" } as never);
    return testModel("u1", "m1", { text: "t" }, now);
  };
  const unbound = { bindings: {} };

  it.each(["expense", "income"])("previews a %s with only amount and name in the user's currency", async (kind) => {
    const result = await run({ kind, name: "X", amount: "1234.50" }, unbound);
    expect(result).toMatchObject({ outcome: "proposal", transactionPreview: { amount: "1234.50", type: kind, executionCurrency: "EUR" } });
    expect(result.transactionPreview).not.toHaveProperty("account");
    expect(result.validationErrors).toBeUndefined();
    expect(prismaMock.account.findMany).not.toHaveBeenCalled();
  });

  it("uses an explicit currency without an account or category", async () => {
    expect(await run({ kind: "income", name: "X", amount: "1.00", currency: "GBP" }, unbound)).toMatchObject({
      transactionPreview: { executionCurrency: "GBP" }
    });
  });

  it("uses the bound account's currency", async () => {
    expect(await run({ kind: "expense", name: "X", amount: "1.00", account: "card" })).toMatchObject({
      transactionPreview: { executionCurrency: "MXN", account: "Plata" }
    });
    expect(prismaMock.account.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["a1"] }, userId: "u1" } }));
  });

  it("previews valid account and category bindings by name", async () => {
    expect(await run(proposal)).toMatchObject({ transactionPreview: { account: "Plata", category: "Food", executionCurrency: "MXN" } });
  });

  it("reports mapping_missing for an explicitly referenced unbound slot", async () => {
    expect(await run({ kind: "expense", name: "X", amount: "1.00", category: "general" }, unbound)).toMatchObject({
      outcome: "error",
      error: { message: "mapping_missing:general" }
    });
  });

  it("rejects an invalid explicit currency with the transaction domain's message", async () => {
    vi.mocked(resolveTransactionCurrencyFields).mockRejectedValue(new HttpError(502, "Exchange rate is unavailable for ZZZ"));
    expect(await run({ kind: "expense", name: "X", amount: "1.00", currency: "ZZZ" }, unbound)).toMatchObject({
      outcome: "error",
      error: { message: "Exchange rate is unavailable for ZZZ" }
    });
  });

  it("rejects a binding to an account the user does not own", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    expect(await run({ kind: "expense", name: "X", amount: "1.00", account: "card" })).toMatchObject({
      outcome: "error",
      error: { message: "Account does not exist or is archived" }
    });
  });

  it("rejects an explicit currency differing from the bound account's, as createTransaction does", async () => {
    expect(await run({ kind: "expense", name: "X", amount: "1.00", account: "card", currency: "USD" })).toMatchObject({
      outcome: "error",
      error: { message: "accountAmount is required when USD differs from MXN" }
    });
  });

  it("keeps decimal precision exactly", async () => {
    expect(await run({ kind: "expense", name: "X", amount: "1234.50" }, unbound)).toMatchObject({ transactionPreview: { amount: "1234.50" } });
  });
});

describe("parseCodeToRules", () => {
  it("delegates to parseRules with the caller's id", async () => {
    vi.mocked(parseRules).mockResolvedValue({ errors: [] });
    expect(await parseCodeToRules("u1", "code")).toEqual({ errors: [] });
    expect(parseRules).toHaveBeenCalledWith("code", "u1");
  });
});
