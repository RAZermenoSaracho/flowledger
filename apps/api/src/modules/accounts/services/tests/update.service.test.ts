import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { archiveAccount, restoreAccount, updateAccount } from "../update.service.js";

describe("updateAccount", () => {
  it("updates the account owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await updateAccount("user-1", "acc-1", { name: "Renamed" });

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { name: "Renamed" }
    });
  });

  it("throws a 404 when the account isn't owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      updateAccount("user-1", "not-mine", { name: "Renamed" })
    ).rejects.toThrow("Account not found");
  });
});

describe("updateAccount currency lock", () => {
  it("rejects a currency change while a transaction references the account, naming currency", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", currency: "USD" } as never);
    prismaMock.transaction.findFirst.mockResolvedValue({ id: "txn-1" } as never);

    await expect(updateAccount("user-1", "acc-1", { currency: "MXN" })).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { currency: [expect.any(String)] } } }
    });
    expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ accountId: "acc-1" }, { transferToAccountId: "acc-1" }] }
      })
    );
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });

  it("allows a currency change on an unused account", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", currency: "USD" } as never);
    prismaMock.transaction.findFirst.mockResolvedValue(null);
    prismaMock.account.update.mockResolvedValue({} as never);

    await updateAccount("user-1", "acc-1", { currency: "MXN" });

    expect(prismaMock.account.update).toHaveBeenCalled();
  });

  it("does not check transactions when the currency is unchanged", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", currency: "USD" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await updateAccount("user-1", "acc-1", { currency: "USD" });

    expect(prismaMock.transaction.findFirst).not.toHaveBeenCalled();
  });
});

describe("archiveAccount", () => {
  it("marks the account archived with a timestamp", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await archiveAccount("user-1", "acc-1");

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { isArchived: true, archivedAt: expect.any(Date) }
    });
  });

  it("throws a 404 when the account isn't owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(archiveAccount("user-1", "not-mine")).rejects.toThrow(
      "Account not found"
    );
  });
});

describe("restoreAccount", () => {
  it("clears the archived flag and timestamp", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await restoreAccount("user-1", "acc-1");

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { isArchived: false, archivedAt: null }
    });
  });
});

describe("updateAccount credit-card rules", () => {
  const card = {
    id: "acc-1",
    type: "credit_card",
    currency: "MXN",
    creditLimit: null,
    statementClosingDay: 20,
    paymentDueRule: "day_of_next_month",
    paymentDueValue: 20,
    billingTimeZone: "America/Mexico_City",
    annualInterestRate: null
  };

  it("rejects a card-only field on a stored non-card account, naming the field", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "checking", currency: "USD" } as never);

    await expect(updateAccount("user-1", "acc-1", { creditLimit: "1000" })).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { creditLimit: [expect.any(String)] } } }
    });
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });

  it("accepts card fields on a stored card account", async () => {
    prismaMock.account.findFirst.mockResolvedValue(card as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await updateAccount("user-1", "acc-1", { creditLimit: "30000" });

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { creditLimit: "30000" }
    });
  });

  it("rejects a due value past the stored closing day, naming paymentDueValue", async () => {
    prismaMock.account.findFirst.mockResolvedValue(card as never);

    await expect(updateAccount("user-1", "acc-1", { paymentDueValue: 25 })).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { paymentDueValue: [expect.any(String)] } } }
    });
  });

  it("clears the six card fields when the type leaves credit_card", async () => {
    prismaMock.account.findFirst.mockResolvedValue(card as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await updateAccount("user-1", "acc-1", { type: "checking" });

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: {
        type: "checking",
        creditLimit: null,
        statementClosingDay: null,
        paymentDueRule: null,
        paymentDueValue: null,
        billingTimeZone: null,
        annualInterestRate: null
      }
    });
  });

  it("rejects card fields sent together with a non-card type change", async () => {
    prismaMock.account.findFirst.mockResolvedValue(card as never);

    await expect(
      updateAccount("user-1", "acc-1", { type: "checking", creditLimit: "5" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("updateAccount type-change guard", () => {
  it("rejects moving an account with holdings to a type that cannot hold them, naming type", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.count.mockResolvedValue(2);

    await expect(updateAccount("user-1", "acc-1", { type: "savings" })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Remove the account's holdings"),
      details: { issues: { fieldErrors: { type: [expect.any(String)] } } }
    });
    expect(prismaMock.holding.count).toHaveBeenCalledWith({ where: { accountId: "acc-1", userId: "user-1" } });
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });

  it("allows the change without holdings, and between eligible types with holdings", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);
    prismaMock.holding.count.mockResolvedValue(0);
    await updateAccount("user-1", "acc-1", { type: "savings" });

    prismaMock.holding.count.mockResolvedValue(0);
    await updateAccount("user-1", "acc-1", { type: "crypto" });
    expect(prismaMock.account.update).toHaveBeenCalledTimes(2);
  });
});

 describe("holding account type transitions", () => {
  it("rejects investment to crypto with cash, and allows crypto to investment", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "investment" } as never);
    prismaMock.holding.count.mockResolvedValue(1);
    await expect(updateAccount("user-1", "acc-1", { type: "crypto" })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.holding.count).toHaveBeenCalledWith({ where: { accountId: "acc-1", userId: "user-1", kind: { not: "crypto" } } });
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1", type: "crypto" } as never);
    await updateAccount("user-1", "acc-1", { type: "investment" });
    expect(prismaMock.account.update).toHaveBeenCalledTimes(1);
  });
});
