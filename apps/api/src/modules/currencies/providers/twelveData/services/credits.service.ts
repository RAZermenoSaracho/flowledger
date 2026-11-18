import { prisma } from "../../../../../db/prisma.js";
import { env } from "../../../../../config/env.js";
import type { CreditReservation } from "../types/twelveData.types.js";

const PROVIDER = "twelve_data";
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Start of the minute containing `now`. */
export const minuteStart = (now: Date) => new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
/** Start of the next minute after `now`. */
export const nextMinuteStart = (now: Date) => new Date(minuteStart(now).getTime() + MINUTE_MS);
/** Start (00:00 UTC) of the UTC day containing `now`. */
export const dayStart = (now: Date) => new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
/** The next 00:00 UTC after `now`. */
export const nextDayStart = (now: Date) => new Date(dayStart(now).getTime() + DAY_MS);

/**
 * Reserves `cost` credits in one window without ever exceeding `limit`, even across processes: the window row is created if
 * missing, then incremented by a conditional update that only matches while `used <= limit - cost`. Returns whether it fit.
 * The first window of a UTC day also deletes windows older than two days.
 */
async function reserveWindow(kind: "minute" | "day", windowStart: Date, limit: number, cost: number): Promise<boolean> {
  const created = await prisma.providerCreditWindow.createMany({
    data: [{ provider: PROVIDER, kind, windowStart, used: 0 }],
    skipDuplicates: true
  });
  if (kind === "day" && created.count > 0) {
    await prisma.providerCreditWindow.deleteMany({
      where: { provider: PROVIDER, windowStart: { lt: new Date(windowStart.getTime() - 2 * DAY_MS) } }
    });
  }
  const updated = await prisma.providerCreditWindow.updateMany({
    where: { provider: PROVIDER, kind, windowStart, used: { lte: limit - cost } },
    data: { used: { increment: cost } }
  });
  return updated.count === 1;
}

/**
 * Reserves provider credits in the current minute window and then the current UTC-day window, shared by every process.
 * When the day window is full after the minute credit was taken, that minute credit is left spent (a conservative overcount).
 */
export async function reserveCredits(cost = 1, now = new Date()): Promise<CreditReservation> {
  if (!(await reserveWindow("minute", minuteStart(now), env.TWELVE_DATA_CREDITS_PER_MINUTE, cost))) return "minute_full";
  if (!(await reserveWindow("day", dayStart(now), env.TWELVE_DATA_CREDITS_PER_DAY, cost))) return "day_full";
  return "reserved";
}

/** Marks the current minute window as full for every process, after the provider reported a rate limit. */
export async function markMinuteExhausted(now = new Date()): Promise<void> {
  const windowStart = minuteStart(now);
  await prisma.providerCreditWindow.createMany({
    data: [{ provider: PROVIDER, kind: "minute", windowStart, used: 0 }],
    skipDuplicates: true
  });
  await prisma.providerCreditWindow.updateMany({
    where: { provider: PROVIDER, kind: "minute", windowStart, used: { lt: env.TWELVE_DATA_CREDITS_PER_MINUTE } },
    data: { used: env.TWELVE_DATA_CREDITS_PER_MINUTE }
  });
}
