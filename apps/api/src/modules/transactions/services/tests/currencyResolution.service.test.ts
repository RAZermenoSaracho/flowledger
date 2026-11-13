import { beforeEach, describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { resolveExecutionCurrency } from "../currencyResolution.service.js";

function setup(accountCurrency: string | null, preferredCurrency: string | null) {
  prismaMock.account.findMany.mockResolvedValue(accountCurrency ? ([{ id: "a1", currency: accountCurrency }] as never) : []);
  prismaMock.user.findUniqueOrThrow.mockResolvedValue({ preferredCurrency } as never);
}

describe("resolveExecutionCurrency", () => {
  beforeEach(() => setup("MXN", "EUR"));

  it("prefers the explicit currency over the account's", async () => {
    expect(await resolveExecutionCurrency("u1", { executionCurrency: "JPY", accountId: "a1" })).toMatchObject({ currency: "JPY", preferredCurrency: "EUR" });
  });

  it("uses the owned account's currency, looked up by userId", async () => {
    expect((await resolveExecutionCurrency("u1", { accountId: "a1" })).currency).toBe("MXN");
    expect(prismaMock.account.findMany).toHaveBeenCalledWith({ where: { id: { in: ["a1"] }, userId: "u1" }, select: { id: true, currency: true } });
  });

  it("falls back to the preferred currency without an account or for a foreign one", async () => {
    expect((await resolveExecutionCurrency("u1", {})).currency).toBe("EUR");
    expect(prismaMock.account.findMany).not.toHaveBeenCalled();
    setup(null, "EUR");
    expect((await resolveExecutionCurrency("u1", { accountId: "foreign" })).currency).toBe("EUR");
  });

  it("falls back to USD when the user has no preferred currency", async () => {
    setup(null, null);
    expect(await resolveExecutionCurrency("u1", {})).toMatchObject({ currency: "USD", preferredCurrency: null });
  });
});
