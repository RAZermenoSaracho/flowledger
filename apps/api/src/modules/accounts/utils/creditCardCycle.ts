import type { CycleConfig, LocalDate, PeriodBounds } from "../types/creditCardBilling.types.js";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zoneFields(instant: Date, timeZone: string) {
  const fields: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return fields as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** The zone's offset from UTC in milliseconds at `instant` (positive east of UTC). */
function zoneOffsetMs(instant: Date, timeZone: string) {
  const f = zoneFields(instant, timeZone);
  const wall = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Number of days in month `m` (1-12) of year `y`. */
export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The calendar date of `instant` as seen in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const f = zoneFields(instant, timeZone);
  return { y: f.year, m: f.month, d: f.day };
}

/** The instant at which `date` starts (local 00:00) in `timeZone`; DST-safe via a second offset resolution. */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const guess = Date.UTC(date.y, date.m - 1, date.d);
  const first = zoneOffsetMs(new Date(guess), timeZone);
  const second = zoneOffsetMs(new Date(guess - first), timeZone);
  return new Date(guess - second);
}

/** `date` shifted by `days` (may be negative) calendar days. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate) {
  return Math.round((Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / 86_400_000);
}

/** Formats a local date as `YYYY-MM-DD`. */
export function formatLocalDate(date: LocalDate) {
  return `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

/** The `monthIndex` (`year * 12 + month - 1`) of a local date's month. */
export function monthIndexOf(date: LocalDate) {
  return date.y * 12 + date.m - 1;
}

function dateInMonth(monthIndex: number, day: number): LocalDate {
  const y = Math.floor(monthIndex / 12);
  const m = (monthIndex % 12) + 1;
  return { y, m, d: Math.min(day, daysInMonth(y, m)) };
}

/** Closing date of the period whose closing month is `monthIndex`: the configured day, clamped to the month's length. */
export function closingDateOf(config: CycleConfig, monthIndex: number): LocalDate {
  return dateInMonth(monthIndex, config.statementClosingDay);
}

/** Due date of the period closing in `monthIndex`, per the configured due rule. */
export function dueDateOf(config: CycleConfig, monthIndex: number): LocalDate {
  if (config.paymentDueRule === "day_of_next_month") {
    return dateInMonth(monthIndex + 1, config.paymentDueValue);
  }
  return addDays(closingDateOf(config, monthIndex), config.paymentDueValue);
}

/** Computes every boundary (local dates and half-open instants) of the period closing in `monthIndex`. */
export function periodBounds(config: CycleConfig, monthIndex: number): PeriodBounds {
  const zone = config.billingTimeZone;
  const closingDate = closingDateOf(config, monthIndex);
  const previousClosing = closingDateOf(config, monthIndex - 1);
  const dueDate = dueDateOf(config, monthIndex);
  return {
    monthIndex,
    start: addDays(previousClosing, 1),
    closingDate,
    dueDate,
    startInstant: startOfLocalDay(addDays(previousClosing, 1), zone),
    closeInstant: startOfLocalDay(addDays(closingDate, 1), zone),
    dueInstant: startOfLocalDay(addDays(dueDate, 1), zone)
  };
}

/** The `monthIndex` of the period whose half-open interval contains `instant`. */
export function periodIndexContaining(config: CycleConfig, instant: Date): number {
  const local = localDateOf(instant, config.billingTimeZone);
  const index = monthIndexOf(local);
  return local.d <= closingDateOf(config, index).d ? index : index + 1;
}

/** Month indexes from the period containing `from` through the one containing `to` (inclusive), oldest first. */
export function enumeratePeriodIndexes(config: CycleConfig, from: Date, to: Date): number[] {
  const first = periodIndexContaining(config, from);
  const last = Math.max(first, periodIndexContaining(config, to));
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}
