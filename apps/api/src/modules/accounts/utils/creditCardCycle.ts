import type {
  CycleConfig,
  LocalDate,
  PeriodBounds
} from "../types/creditCardBilling.types.js";

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
  return fields as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
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

/**
 * The instant at which `date` starts (local 00:00) in `timeZone`; DST-safe via a second offset
 * resolution.
 */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const guess = Date.UTC(date.y, date.m - 1, date.d);
  const first = zoneOffsetMs(new Date(guess), timeZone);
  const second = zoneOffsetMs(new Date(guess - first), timeZone);
  return new Date(guess - second);
}

/** `date` shifted by `days` (may be negative) calendar days. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate()
  };
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate) {
  return Math.round(
    (Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) /
      86_400_000
  );
}

/** Formats a local date as `YYYY-MM-DD`. */
export function formatLocalDate(date: LocalDate) {
  return `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

/** Parses a `YYYY-MM-DD` string into a local date; the inverse of `formatLocalDate`. */
export function parseLocalDate(value: string): LocalDate {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return { y, m, d };
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

/**
 * Closing date the card's cycle gives the period closing in `monthIndex`: the configured day,
 * clamped to the month's length.
 */
export function defaultClosingDateOf(
  config: CycleConfig,
  monthIndex: number
): LocalDate {
  return dateInMonth(monthIndex, config.statementClosingDay);
}

/** Closing date of the period closing in `monthIndex`: its override, else the default. */
export function closingDateOf(
  config: CycleConfig,
  monthIndex: number
): LocalDate {
  return (
    config.overrides?.get(monthIndex)?.closingDate ??
    defaultClosingDateOf(config, monthIndex)
  );
}

/**
 * Due date the cycle rule gives the period, ignoring the period's own due override but following
 * its effective closing date.
 */
export function defaultDueDateOf(
  config: CycleConfig,
  monthIndex: number
): LocalDate {
  if (config.paymentDueRule === "day_of_next_month") {
    return dateInMonth(monthIndex + 1, config.paymentDueValue);
  }
  return addDays(closingDateOf(config, monthIndex), config.paymentDueValue);
}

/** Due date of the period closing in `monthIndex`: its override, else the default. */
export function dueDateOf(config: CycleConfig, monthIndex: number): LocalDate {
  return (
    config.overrides?.get(monthIndex)?.dueDate ??
    defaultDueDateOf(config, monthIndex)
  );
}

/** The `monthIndex` for a `YYYY-MM` period key. */
export function monthIndexOfKey(key: string) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return y * 12 + m - 1;
}

/** The `YYYY-MM` period key of a `monthIndex`. */
export function keyOfMonthIndex(monthIndex: number) {
  return `${String(Math.floor(monthIndex / 12)).padStart(4, "0")}-${String((monthIndex % 12) + 1).padStart(2, "0")}`;
}

/**
 * Computes every boundary (local dates and half-open instants) of the period closing in
 * `monthIndex`.
 */
export function periodBounds(
  config: CycleConfig,
  monthIndex: number
): PeriodBounds {
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
export function periodIndexContaining(
  config: CycleConfig,
  instant: Date
): number {
  const local = localDateOf(instant, config.billingTimeZone);
  let index = monthIndexOf(local);
  if (local.d > defaultClosingDateOf(config, index).d) index += 1;
  while (daysBetween(closingDateOf(config, index), local) > 0) index += 1;
  while (daysBetween(closingDateOf(config, index - 1), local) <= 0) index -= 1;
  return index;
}

/**
 * Month indexes from the period containing `from` through the one containing `to` (inclusive),
 * oldest first.
 */
export function enumeratePeriodIndexes(
  config: CycleConfig,
  from: Date,
  to: Date
): number[] {
  const first = periodIndexContaining(config, from);
  const last = Math.max(first, periodIndexContaining(config, to));
  return Array.from(
    { length: last - first + 1 },
    (_, offset) => first + offset
  );
}

/**
 * Checks the periods `indexes` against the cycle invariants. Closing-order violations are
 * reported before any due-date violation, so the error names the date the caller changed rather
 * than a neighbour's due date. Closing dates strictly increase and each due
 * date is after its own closing date. A due date may fall after the next closing: boundaries and payment deadlines are independent. Returns a message naming the first offending period,
 * or `null` when the sequence is consistent.
 */
export function validateCycleSequence(
  config: CycleConfig,
  indexes: Iterable<number>
): string | null {
  const checked = [...new Set(indexes)];
  for (const index of checked) {
    if (
      daysBetween(
        closingDateOf(config, index - 1),
        closingDateOf(config, index)
      ) <= 0
    ) {
      return `Period ${keyOfMonthIndex(index)}: the closing date must be after the previous period's closing date`;
    }
  }
  for (const index of checked) {
    const key = keyOfMonthIndex(index);
    const due = dueDateOf(config, index);
    if (daysBetween(closingDateOf(config, index), due) <= 0) {
      return `Period ${key}: the payment due date must be after its closing date`;
    }
  }
  return null;
}
