import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Needs Docker (see docs/TESTING.md): the (userId, dedupeKey) unique constraint is what makes concurrent runs idempotent.
let app: Express;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];
let runCreditCardReminders: typeof import("../../modules/notifications/services/creditCardReminders.service.js").runCreditCardReminders;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const CYCLE = { statementClosingDay: 20, paymentDueRule: "day_of_next_month", paymentDueValue: 20, billingTimeZone: "America/Mexico_City" };

async function owner(cardName: string, archive = false) {
  const { token, user } = await createAuthedUser(app);
  const card = (await request(app).post("/accounts").set(bearer(token)).send({ name: cardName, type: "credit_card", currency: "MXN", ...CYCLE })).body.account.id as string;
  const category = (await request(app).post("/categories").set(bearer(token)).send({ name: "Food", type: "expense" })).body.category.id as string;
  const purchase = await request(app)
    .post("/transactions")
    .set(bearer(token))
    .send({ name: "Buy", amount: "10000", type: "expense", date: "2027-01-10T18:00:00Z", accountId: card, categoryId: category });
  expect(purchase.status, JSON.stringify(purchase.body)).toBe(201);
  if (archive) await request(app).post(`/accounts/${card}/archive`).set(bearer(token));
  return { userId: user.id, card, token };
}

describe("credit card reminders (real Postgres)", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    ({ runCreditCardReminders } = await import("../../modules/notifications/services/creditCardReminders.service.js"));
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("concurrent and repeated runs leave one notification per key, per owner, and skip archived cards", async () => {
    const a = await owner("Card A");
    const b = await owner("Card B");
    const archived = await owner("Old", true);
    const now = new Date("2027-02-17T18:00:00Z");

    await Promise.all([runCreditCardReminders(now), runCreditCardReminders(now), runCreditCardReminders(now)]);
    await runCreditCardReminders(now);

    for (const who of [a, b]) {
      const rows = await prisma.notification.findMany({ where: { userId: who.userId }, orderBy: { dedupeKey: "asc" } });
      expect(rows.map((r) => r.dedupeKey)).toEqual([
        `cc:credit_card_payment_due_soon:${who.card}:2027-01-20`,
        `cc:credit_card_period_closed:${who.card}:2027-01-20`
      ].sort());
      expect(rows.find((r) => r.type === "credit_card_payment_due_soon")!.message).toContain("remaining 10000 MXN");
    }
    expect(await prisma.notification.count({ where: { userId: archived.userId } })).toBe(0);
  }, 120_000);
});
