import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { HttpError } from "../../../../utils/httpError.js";

const runScript = vi.fn();
const createTransaction = vi.fn();
vi.mock("../../sandbox/runScript.js", () => ({ runScript }));
vi.mock("../../../transactions/services/create.service.js", () => ({ createTransaction }));

const { processRun } = await import("../processRun.service.js");

const receivedAt = new Date("2026-11-13T18:04:11.000Z");
const run = { id: "r1", userId: "u1", modelId: "m1", text: "Compraste", receivedAt, workerId: "w1" };
const guard = { id: "r1", status: "processing", workerId: "w1" };
const slots = [
  { key: "card", kind: "account", label: "Card", required: true },
  { key: "savings", kind: "account", label: "Savings", required: false }
];
const bindings = { card: "acc1", savings: "acc2" };
const expense = { kind: "expense", name: "OXXO", amount: "1234.50", currency: "MXN", account: "card" };

function model(over: object = {}) {
  prismaMock.notificationModel.findFirst.mockResolvedValue({ isActive: true, code: "c", settings: {}, slots, bindings, ...over } as never);
}
const lastUpdate = () => prismaMock.notificationRun.updateMany.mock.calls.at(-1)![0]!;

beforeEach(() => {
  model();
  prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 1 });
  createTransaction.mockResolvedValue({ id: "t1" });
});

describe("processRun", () => {
  it("skips with model_inactive when the model is inactive, without running the script", async () => {
    model({ isActive: false });
    await expect(processRun(run)).resolves.toBe("skipped");
    expect(runScript).not.toHaveBeenCalled();
    expect(lastUpdate()).toMatchObject({ where: guard, data: { status: "skipped", reason: "model_inactive" } });
    expect(lastUpdate().data.finishedAt).toBeInstanceOf(Date);
  });

  it("skips on a script skip result", async () => {
    runScript.mockResolvedValue({ kind: "skip", reason: "promotion", stdout: "" });
    await expect(processRun(run)).resolves.toBe("skipped");
    expect(lastUpdate().data).toMatchObject({ status: "skipped", reason: "promotion" });
  });

  it("fails on a script error with its line", async () => {
    runScript.mockResolvedValue({ kind: "error", error: { message: "ValueError: no amount", line: 7 }, stdout: "" });
    await expect(processRun(run)).resolves.toBe("failed");
    expect(lastUpdate().data).toMatchObject({ status: "failed", reason: "ValueError: no amount (line 7)" });
  });

  it("fails naming the offending field when the proposal does not validate", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: { kind: "expense", name: "X", amount: "1.2.3" }, stdout: "" });
    await expect(processRun(run)).resolves.toBe("failed");
    expect(lastUpdate().data).toMatchObject({ reason: expect.stringMatching(/^invalid result: amount: /) });
  });

  it("fails with mapping_missing:<key> for an unbound slot", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: { ...expense, account: "nope" }, stdout: "" });
    await expect(processRun(run)).resolves.toBe("failed");
    expect(lastUpdate().data).toMatchObject({ reason: "mapping_missing:nope" });
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("creates the transaction and completes the run in one DB transaction, defaulting the date to receivedAt", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: expense, stdout: "" });
    await expect(processRun(run)).resolves.toBe("completed");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(createTransaction).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ name: "OXXO", type: "expense", accountId: "acc1", executionCurrency: "MXN", date: receivedAt.toISOString() }),
      prismaMock
    );
    expect(lastUpdate()).toMatchObject({ where: guard, data: { status: "completed", transactionId: "t1" } });
  });

  it("maps income and transfer (destination amount, to_account)", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: { ...expense, kind: "income" }, stdout: "" });
    await processRun(run);
    expect(createTransaction.mock.calls[0]![1]).toMatchObject({ type: "income", accountId: "acc1" });

    createTransaction.mockClear();
    runScript.mockResolvedValue({
      kind: "proposal",
      proposal: { ...expense, kind: "transfer", to_account: "savings", destination_amount: "60.00", date: "2026-11-01" },
      stdout: ""
    });
    await processRun(run);
    expect(createTransaction.mock.calls[0]![1]).toMatchObject({ type: "transfer", transferToAccountId: "acc2", destinationAmount: "60.00", date: "2026-11-01" });
  });

  it("skips with model_inactive when the model is deactivated before the create step", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: expense, stdout: "" });
    prismaMock.notificationModel.findFirst
      .mockResolvedValueOnce({ isActive: true, code: "c", settings: {}, slots, bindings } as never)
      .mockResolvedValueOnce({ isActive: false } as never);
    await expect(processRun(run)).resolves.toBe("skipped");
    expect(createTransaction).not.toHaveBeenCalled();
    expect(lastUpdate().data).toMatchObject({ status: "skipped", reason: "model_inactive" });
  });

  it("turns an HttpError from createTransaction into a failed run with a truncated message", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: expense, stdout: "" });
    createTransaction.mockRejectedValue(new HttpError(400, "x".repeat(600)));
    await expect(processRun(run)).resolves.toBe("failed");
    expect(lastUpdate().data.reason).toHaveLength(500);
  });

  it("throws (rolling back) when the completion guard matches no row", async () => {
    runScript.mockResolvedValue({ kind: "proposal", proposal: expense, stdout: "" });
    prismaMock.notificationRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(processRun(run)).rejects.toThrow("no longer owned");
  });

  it("propagates a sandbox abort without touching the run", async () => {
    runScript.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(processRun(run)).rejects.toMatchObject({ name: "AbortError" });
    expect(prismaMock.notificationRun.updateMany).not.toHaveBeenCalled();
  });
});

describe("processRun optional fields and currency", () => {
  const propose = (proposal: object) => runScript.mockResolvedValue({ kind: "proposal", proposal, stdout: "" });
  const created = () => createTransaction.mock.calls.at(-1)![1];

  it.each(["expense", "income"])("creates a %s from only amount and name, leaving currency to createTransaction", async (kind) => {
    model({ bindings: {}, slots: [] });
    propose({ kind, name: "X", amount: "1234.50" });
    await expect(processRun(run)).resolves.toBe("completed");
    expect(created()).toMatchObject({ type: kind, amount: "1234.50", name: "X" });
    expect(created()).not.toHaveProperty("executionCurrency");
    expect(created()).not.toHaveProperty("accountId");
  });

  it("passes an explicit currency with no account or category", async () => {
    model({ bindings: {}, slots: [] });
    propose({ kind: "expense", name: "X", amount: "1.00", currency: "USD" });
    await processRun(run);
    expect(created()).toMatchObject({ executionCurrency: "USD" });
    expect(created()).not.toHaveProperty("accountId");
  });

  it("passes the bound account without a currency so the account's currency applies", async () => {
    propose({ kind: "expense", name: "X", amount: "1.00", account: "card" });
    await processRun(run);
    expect(created()).toMatchObject({ accountId: "acc1" });
    expect(created()).not.toHaveProperty("executionCurrency");
  });

  it("fails with mapping_missing for an explicitly referenced unbound category", async () => {
    model({ bindings: {}, slots: [] });
    propose({ kind: "expense", name: "X", amount: "1.00", category: "general" });
    await expect(processRun(run)).resolves.toBe("failed");
    expect(lastUpdate().data).toMatchObject({ reason: "mapping_missing:general" });
  });

  it.each([
    ["an invalid explicit currency", "Exchange rate is unavailable for ZZZ"],
    ["a foreign account binding", "Account does not exist or is archived"]
  ])("fails with the domain message for %s", async (_label, message) => {
    propose({ kind: "expense", name: "X", amount: "1.00", account: "card", currency: "ZZZ" });
    createTransaction.mockRejectedValue(new HttpError(400, message));
    await expect(processRun(run)).resolves.toBe("failed");
    expect(lastUpdate().data).toMatchObject({ status: "failed", reason: message });
  });

  it("preserves decimal precision", async () => {
    propose({ kind: "expense", name: "X", amount: "1234.50", account: "card" });
    await processRun(run);
    expect(created().amount).toBe("1234.50");
  });
});
