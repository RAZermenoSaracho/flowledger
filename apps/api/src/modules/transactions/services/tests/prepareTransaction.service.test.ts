import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/transactionCurrency.js", () => ({ resolveTransactionCurrencyFields: vi.fn().mockResolvedValue({ fields: true }) }));

const { prepareTransactionInput } = await import("../prepareTransaction.service.js");

const body = { name: "X", amount: "10.00", type: "expense", date: "2026-01-01T00:00:00.000Z", accountId: "a1" } as never;

beforeEach(() => {
  prismaMock.account.findFirst.mockResolvedValue({ id: "a1" } as never);
  prismaMock.account.findMany.mockResolvedValue([{ id: "a1", currency: "MXN" }] as never);
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency: "EUR" } as never);
});

describe("prepareTransactionInput", () => {
  it("resolves the account currency and applied amounts, stripping sharedExpense/executionCurrency", async () => {
    const result = await prepareTransactionInput("u1", body);
    expect(result.executionCurrency).toBe("MXN");
    expect(result.appliedAmounts.accountAmount?.toString()).toBe("10");
    expect(result.input).not.toHaveProperty("executionCurrency");
    expect(prismaMock.account.findMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a currency differing from the account's without accountAmount", async () => {
    await expect(prepareTransactionInput("u1", { ...(body as object), executionCurrency: "USD" } as never)).rejects.toMatchObject({
      message: "accountAmount is required when USD differs from MXN"
    });
  });

  it("rejects an account the user does not own", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(prepareTransactionInput("u1", body)).rejects.toMatchObject({ message: "Account does not exist or is archived" });
  });
});
