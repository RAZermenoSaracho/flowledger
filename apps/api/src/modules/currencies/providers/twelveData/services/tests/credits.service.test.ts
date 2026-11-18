import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

vi.mock("../../../../../../config/env.js", () => ({
  env: { TWELVE_DATA_CREDITS_PER_MINUTE: 3, TWELVE_DATA_CREDITS_PER_DAY: 5 }
}));

const { reserveCredits, markMinuteExhausted, minuteStart, dayStart } = await import("../credits.service.js");

const NOW = new Date("2026-11-17T10:30:45Z");

/** In-memory stand-in for the window table honoring the conditional `updateMany` filter like Postgres would. */
function fakeLedger() {
  const rows = new Map<string, number>();
  const key = (kind: string, start: Date) => `${kind}:${start.toISOString()}`;
  prismaMock.providerCreditWindow.createMany.mockImplementation((async ({ data }: { data: { kind: string; windowStart: Date }[] }) => {
    const row = data[0]!;
    const k = key(row.kind, row.windowStart);
    if (rows.has(k)) return { count: 0 };
    rows.set(k, 0);
    return { count: 1 };
  }) as never);
  prismaMock.providerCreditWindow.updateMany.mockImplementation((async ({ where, data }: { where: { kind: string; windowStart: Date; used: { lte?: number; lt?: number } }; data: { used: number | { increment: number } } }) => {
    const k = key(where.kind, where.windowStart);
    const used = rows.get(k) ?? 0;
    if (where.used.lte !== undefined ? used > where.used.lte : used >= where.used.lt!) return { count: 0 };
    rows.set(k, typeof data.used === "number" ? data.used : used + data.used.increment);
    return { count: 1 };
  }) as never);
  return rows;
}

beforeEach(() => {
  prismaMock.providerCreditWindow.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe("reserveCredits", () => {
  it("reserves in the minute and UTC-day windows and never exceeds the minute limit", async () => {
    fakeLedger();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await reserveCredits(1, NOW));
    expect(results).toEqual(["reserved", "reserved", "reserved", "minute_full", "minute_full"]);
  });

  it("never exceeds the daily limit across minutes and leaves the spent minute credit", async () => {
    const rows = fakeLedger();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await reserveCredits(1, new Date(NOW.getTime() + i * 60_000)));
    expect(results.filter((r) => r === "reserved")).toHaveLength(5);
    expect(results.slice(5)).toEqual(["day_full", "day_full"]);
    expect(rows.get(`day:${dayStart(NOW).toISOString()}`)).toBe(5);
  });

  it("uses a conditional update so concurrent reservations cannot overshoot", async () => {
    fakeLedger();
    await reserveCredits(1, NOW);
    expect(prismaMock.providerCreditWindow.updateMany).toHaveBeenCalledWith({
      where: { provider: "twelve_data", kind: "minute", windowStart: minuteStart(NOW), used: { lte: 2 } },
      data: { used: { increment: 1 } }
    });
  });

  it("deletes windows older than two days only when a day window is first created", async () => {
    fakeLedger();
    await reserveCredits(1, NOW);
    expect(prismaMock.providerCreditWindow.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.providerCreditWindow.deleteMany).toHaveBeenCalledWith({
      where: { provider: "twelve_data", windowStart: { lt: new Date(dayStart(NOW).getTime() - 2 * 86_400_000) } }
    });
    await reserveCredits(1, NOW);
    expect(prismaMock.providerCreditWindow.deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("markMinuteExhausted", () => {
  it("fills the current minute window so every process stops", async () => {
    const rows = fakeLedger();
    await markMinuteExhausted(NOW);
    expect(rows.get(`minute:${minuteStart(NOW).toISOString()}`)).toBe(3);
    expect(await reserveCredits(1, NOW)).toBe("minute_full");
  });
});
