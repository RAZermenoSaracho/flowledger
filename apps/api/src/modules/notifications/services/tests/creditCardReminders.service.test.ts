import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import type { CardEntry } from "../../../accounts/types/creditCardBilling.types.js";

const loadCardEntries = vi.fn();
const createNotifications = vi.fn();
vi.mock("../../../accounts/services/creditCard.read.service.js", () => ({ loadCardEntries }));
vi.mock("../create.service.js", () => ({ createNotifications }));

const { runCreditCardReminders } = await import("../creditCardReminders.service.js");

const D = (value: number) => new Prisma.Decimal(value);
const charge = (date: string, amount: number): CardEntry => ({ date: new Date(date), delta: D(-amount), role: "charge" });
const payment = (date: string, amount: number): CardEntry => ({
  date: new Date(date),
  delta: D(amount),
  role: "credit",
  creditKind: "transfer"
});

function card(id: string, userId: string, name = "Plata") {
  return {
    id,
    userId,
    name,
    currency: "MXN",
    initialBalance: D(0),
    createdAt: new Date("2026-12-01T00:00:00Z"),
    creditLimit: D(50000),
    statementClosingDay: 20,
    paymentDueRule: "day_of_next_month",
    paymentDueValue: 20,
    billingTimeZone: "America/Mexico_City",
    annualInterestRate: null
  };
}

async function run(entries: CardEntry[], now: string, cards = [card("c1", "u1")]) {
  prismaMock.account.findMany.mockResolvedValue(cards as never);
  loadCardEntries.mockImplementation(async (_userId: string, ids: string[]) => new Map(ids.map((id) => [id, entries])));
  createNotifications.mockClear();
  await runCreditCardReminders(new Date(now));
  const inputs = (createNotifications.mock.calls[0]?.[1] ?? []) as Array<{ type: string; dedupeKey: string; message: string; userId: string; metadata: unknown }>;
  return inputs;
}

const purchase = charge("2027-01-10T18:00:00Z", 10000);

describe("runCreditCardReminders", () => {
  it("queries only active configured cards", async () => {
    await run([], "2027-01-25T18:00:00Z", []);
    expect(prismaMock.account.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ type: "credit_card", isArchived: false, billingTimeZone: { not: null } })
    });
  });

  it("emits closed once the period closes, with no due-soon yet", async () => {
    const inputs = await run([purchase], "2027-01-25T18:00:00Z");
    expect(inputs.map((n) => n.type)).toEqual(["credit_card_period_closed"]);
    expect(inputs[0]).toMatchObject({
      userId: "u1",
      dedupeKey: "cc:credit_card_period_closed:c1:2027-01-20",
      metadata: { accountId: "c1", closingDate: "2027-01-20" }
    });
    expect(inputs[0]!.message).toContain("Plata");
    expect(inputs[0]!.message).toContain("10000 MXN");
    expect(inputs[0]!.message).toContain("due 2027-02-20");
  });

  it("emits due soon on 2027-02-17 and not on 2027-02-16", async () => {
    expect((await run([purchase], "2027-02-16T18:00:00Z")).map((n) => n.type)).not.toContain("credit_card_payment_due_soon");
    const inputs = await run([purchase], "2027-02-17T18:00:00Z");
    const soon = inputs.find((n) => n.type === "credit_card_payment_due_soon")!;
    expect(soon.dedupeKey).toBe("cc:credit_card_payment_due_soon:c1:2027-01-20");
    expect(soon.message).toContain("3 days remaining");
    expect(soon.message).toContain("remaining 10000 MXN");
  });

  it("emits partially paid with 4000 remaining, then paid", async () => {
    const partial = await run([purchase, payment("2027-02-01T18:00:00Z", 6000)], "2027-02-10T18:00:00Z");
    const p = partial.find((n) => n.type === "credit_card_period_partially_paid")!;
    expect(p.message).toContain("remaining 4000 MXN");
    expect(partial.map((n) => n.type)).not.toContain("credit_card_period_paid");

    const paid = await run(
      [purchase, payment("2027-02-01T18:00:00Z", 6000), payment("2027-02-05T18:00:00Z", 4000)],
      "2027-02-18T18:00:00Z"
    );
    expect(paid.map((n) => n.type).sort()).toEqual(["credit_card_period_closed", "credit_card_period_paid"]);
  });

  it("emits overdue for the period whose due date equals the next closing", async () => {
    const inputs = await run([purchase, payment("2027-02-01T18:00:00Z", 6000)], "2027-02-21T18:00:00Z");
    const overdue = inputs.find((n) => n.type === "credit_card_payment_overdue")!;
    expect(overdue.dedupeKey).toBe("cc:credit_card_payment_overdue:c1:2027-01-20");
    expect(overdue.message).toContain("remaining 4000 MXN");
    expect(overdue.message).toContain("1 days overdue");
  });

  it("does not emit overdue before the due date ends", async () => {
    const inputs = await run([purchase], "2027-02-20T23:00:00Z");
    expect(inputs.map((n) => n.type)).not.toContain("credit_card_payment_overdue");
  });

  it("does not emit overdue when the card debt is already 0", async () => {
    const inputs = await run([purchase, payment("2027-02-21T01:00:00Z", 10000)], "2027-02-21T18:00:00Z");
    expect(inputs.map((n) => n.type)).not.toContain("credit_card_payment_overdue");
  });

  it("produces the same keys after a history edit", async () => {
    const before = await run([purchase, payment("2027-02-01T18:00:00Z", 6000)], "2027-02-10T18:00:00Z");
    const after = await run([purchase, payment("2027-02-01T18:00:00Z", 5000)], "2027-02-10T18:00:00Z");
    expect(after.map((n) => n.dedupeKey)).toEqual(before.map((n) => n.dedupeKey));
  });

  it("notifies each owner only about their own cards", async () => {
    prismaMock.account.findMany.mockResolvedValue([card("c1", "u1"), card("c2", "u2", "Nu")] as never);
    loadCardEntries.mockImplementation(async (userId: string, ids: string[]) =>
      new Map(ids.map((id) => [id, userId === "u1" ? [purchase] : []]))
    );
    createNotifications.mockClear();
    await runCreditCardReminders(new Date("2027-01-25T18:00:00Z"));
    expect(loadCardEntries).toHaveBeenCalledWith("u1", ["c1"]);
    expect(loadCardEntries).toHaveBeenCalledWith("u2", ["c2"]);
    const inputs = createNotifications.mock.calls[0]![1] as Array<{ userId: string }>;
    expect(inputs.every((n) => n.userId === "u1")).toBe(true);
    expect(inputs).toHaveLength(1);
  });
});
