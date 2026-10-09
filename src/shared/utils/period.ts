// Goal periods (`2026`, `2026-H2`, `2026-Q3`) as calendar date ranges. The
// year is the calendar year. Days are `YYYY-MM-DD` strings in the user's local
// time (`localDay`), so a period never shifts with the time zone.

import { GOAL_PERIOD_PATTERN } from '$shared/types/goals';

export interface PeriodRange {
  /** First day, inclusive. */
  readonly start: string;
  /** Last day, inclusive. */
  readonly end: string;
}

export type PeriodPhase = 'past' | 'current' | 'future';

export interface PeriodOption {
  readonly id: string;
  readonly name: string;
  readonly group: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

const lastDayOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/** Today (or `date`) as `YYYY-MM-DD` in local time. */
export const localDay = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The months (1–12) a period covers, or null for a code that isn't a period. */
const periodMonths = (code: string): { readonly year: number; readonly first: number; readonly last: number } | null => {
  if (!GOAL_PERIOD_PATTERN.test(code)) return null;
  const year = Number(code.slice(0, 4));
  const part = code.slice(5);
  if (!part) return { year, first: 1, last: 12 };
  const n = Number(part.slice(1));
  return part.startsWith('H')
    ? { year, first: (n - 1) * 6 + 1, last: n * 6 }
    : { year, first: (n - 1) * 3 + 1, last: n * 3 };
};

/** `2026-H2` → 2026-07-01 to 2026-12-31. Null for a code that isn't a period. */
export const periodRange = (code: string): PeriodRange | null => {
  const months = periodMonths(code);
  if (!months) return null;
  const { year, first, last } = months;
  return {
    start: `${year}-${pad(first)}-01`,
    end: `${year}-${pad(last)}-${pad(lastDayOfMonth(year, last))}`,
  };
};

const monthSpan = (first: number, last: number): string => `${MONTHS[first - 1]}–${MONTHS[last - 1]}`;

/** `2026-H2` → `Jul–Dec 2026`; `2026` → `Jan–Dec 2026`. */
export const periodSpan = (code: string): string | null => {
  const months = periodMonths(code);
  return months ? `${monthSpan(months.first, months.last)} ${months.year}` : null;
};

/** Whether `today` is before, inside or after the period. */
export const periodPhase = (code: string, today: string): PeriodPhase | null => {
  const range = periodRange(code);
  if (!range) return null;
  if (today < range.start) return 'future';
  if (today > range.end) return 'past';
  return 'current';
};

/**
 * How much of the period has gone by at the start of `day`, 0–1: 0 on its
 * first day and before, 1 after its last day.
 */
export const periodElapsed = (code: string, day: string): number | null => {
  const range = periodRange(code);
  if (!range) return null;
  const start = dayNumber(range.start);
  const length = dayNumber(range.end) + 1 - start;
  return Math.min(1, Math.max(0, (dayNumber(day) - start) / length));
};

const optionName = (code: string, today: string): string => {
  const months = periodMonths(code);
  const span = months && code.length > 4 ? monthSpan(months.first, months.last) : 'full year';
  return `${code} (${span})${periodPhase(code, today) === 'current' ? ' · now' : ''}`;
};

/**
 * Years, halves and quarters of last year, this year and next, grouped by year.
 * `keep` (a goal's current period) is added when it falls outside them, so
 * editing an older goal doesn't lose its period.
 */
export const periodOptions = (today: string, keep: string | null = null): readonly PeriodOption[] => {
  const year = Number(today.slice(0, 4));
  const codes = [year - 1, year, year + 1].flatMap((y) => [`${y}`, `${y}-H1`, `${y}-H2`, `${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`]);
  const all = keep && periodRange(keep) && !codes.includes(keep) ? [keep, ...codes] : codes;
  return all.map((id) => ({ id, name: optionName(id, today), group: id.slice(0, 4) }));
};
