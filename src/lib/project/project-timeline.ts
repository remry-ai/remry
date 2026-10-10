// The projects list's Timing and Size columns. Pure: dates are `YYYY-MM-DD`
// day strings (as in $shared/utils/period), offsets are 0–1 fractions of the
// shared axis, and today comes in as an argument.
import { isFinishedStatus, projectStatusTone, type ProjectStatusTone } from '$shared/utils/project-status';

const DAY_MS = 86_400_000;

export interface TimelineInput {
  readonly status: string | null;
  readonly archivedAt?: Date | string | null;
  readonly startDate?: Date | string | null;
  readonly endDate?: Date | string | null;
}

export interface EstimateInput {
  readonly daysOptimistic?: number | null;
  readonly daysLikely?: number | null;
  readonly daysPessimistic?: number | null;
}

export interface AxisMonth {
  readonly offset: number;
  /** Null for a month left unlabelled so the labels don't crowd. */
  readonly label: string | null;
  /** `'27` on the first labelled month of each new year; drawn under the month, so it never widens the label. */
  readonly year: string | null;
}

export interface TimelineAxis {
  /** The first day on the axis, and the day after the last (both month starts). */
  readonly start: string;
  readonly end: string;
  readonly months: readonly AxisMonth[];
  readonly today: number;
}

export interface TimelineSpan {
  readonly left: number;
  readonly width: number;
}

export interface TimelineBar extends TimelineSpan {
  readonly tone: ProjectStatusTone;
  /** Proposed, not committed: drawn faded. */
  readonly tentative: boolean;
  /** Started with no target: the bar runs to today and reads as open-ended. */
  readonly open: boolean;
  /** Only a target: a marker at it, no bar. */
  readonly marker: boolean;
  /** Past its target and not finished: the stretch from the target to today. */
  readonly late: TimelineSpan | null;
  readonly title: string;
}

/** A Date (stored as midnight UTC) or an ISO string, as a day string. */
export const toDay = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const iso = typeof value === 'string' ? value : value.toISOString();
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
};

const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;

const addMonths = (day: string, n: number): string => {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
const formatDay = (day: string): string => DATE.format(asDate(day));

/** Label every month up to a year, then every 2nd, 3rd… so about 12 show. */
const labelStep = (months: number): number => Math.max(1, Math.ceil(months / 12));

/** The axis every row shares: whole months from the earliest date to the latest, today included. Null when nothing is dated. */
export const timelineAxis = (items: readonly TimelineInput[], today: string): TimelineAxis | null => {
  const days = items.flatMap((item) => [toDay(item.startDate), toDay(item.endDate)]).filter((d): d is string => d !== null);
  if (days.length === 0) return null;
  const sorted = [...days, today].sort();
  const start = monthStart(sorted[0] ?? today);
  const end = addMonths(monthStart(sorted[sorted.length - 1] ?? today), 1);
  const span = dayNumber(end) - dayNumber(start);
  const offset = (day: string): number => (dayNumber(day) - dayNumber(start)) / span;

  const months: AxisMonth[] = [];
  for (let day = start; day < end; day = addMonths(day, 1)) months.push({ offset: offset(day), label: null, year: null });
  const step = labelStep(months.length);
  // Three-letter labels, so each fits a month's width; the year goes on a second line where it changes.
  let lastYear = start.slice(0, 4);
  const labelled = months.map((m, i) => {
    if (i % step !== 0) return m;
    const day = addMonths(start, i);
    const year = day.slice(0, 4);
    const changed = year !== lastYear;
    lastYear = year;
    return { ...m, label: MONTH.format(asDate(day)), year: changed ? `'${day.slice(2, 4)}` : null };
  });

  return { start, end, months: labelled, today: offset(today) };
};

const isFinished = (item: TimelineInput): boolean => !!item.archivedAt || isFinishedStatus(item.status);

/** 5d, 3w, 4mo. */
export const shortDuration = (days: number): string =>
  days < 14 ? `${days}d` : days < 60 ? `${Math.round(days / 7)}w` : `${Math.round(days / 30)}mo`;

/** One row's bar on the axis, or null when the project has no dates. */
export const timelineBar = (item: TimelineInput, axis: TimelineAxis, today: string): TimelineBar | null => {
  const start = toDay(item.startDate);
  const end = toDay(item.endDate);
  if (!start && !end) return null;
  const span = dayNumber(axis.end) - dayNumber(axis.start);
  const offset = (day: string): number => (dayNumber(day) - dayNumber(axis.start)) / span;
  // The end of a day: a bar covers its target day too.
  const endOf = (day: string): number => offset(day) + 1 / span;
  const tone = projectStatusTone(item.status);
  const tentative = item.status === 'proposed';

  const lateDays = end && end < today && !isFinished(item) ? dayNumber(today) - dayNumber(end) : 0;
  const late = end && lateDays > 0 ? { left: endOf(end), width: offset(today) - endOf(end) } : null;
  const lateText = lateDays > 0 ? ` · ${shortDuration(lateDays)} late` : '';

  if (start && end) {
    const [from, to] = start <= end ? [start, end] : [end, start];
    return {
      left: offset(from), width: endOf(to) - offset(from), tone, tentative, open: false, marker: false, late,
      title: `${formatDay(start)} → ${formatDay(end)}${lateText}`
    };
  }
  if (start) {
    const to = start < today ? today : start;
    return {
      left: offset(start), width: offset(to) - offset(start), tone, tentative, open: true, marker: start >= today, late: null,
      title: `Starts ${formatDay(start)} · no target date`
    };
  }
  return {
    left: offset(end as string), width: 0, tone, tentative, open: false, marker: true, late,
    title: `Target ${formatDay(end as string)} · no start date${lateText}`
  };
};

/** The expected length in days: PERT with all three points, else the likely value, else the mean of what's given. */
export const expectedDays = (item: EstimateInput): number | null => {
  const o = item.daysOptimistic ?? null;
  const l = item.daysLikely ?? null;
  const p = item.daysPessimistic ?? null;
  if (o !== null && l !== null && p !== null) return (o + 4 * l + p) / 6;
  if (l !== null) return l;
  const given = [o, p].filter((n): n is number => n !== null);
  return given.length > 0 ? given.reduce((a, b) => a + b, 0) / given.length : null;
};

export interface SizeText {
  readonly label: string;
  readonly title: string;
}

/** "~18d", with the points given for the hover text. Null without an estimate. */
export const sizeText = (item: EstimateInput): SizeText | null => {
  const days = expectedDays(item);
  if (days === null) return null;
  const points = [
    item.daysOptimistic != null ? `optimistic ${item.daysOptimistic}` : null,
    item.daysLikely != null ? `likely ${item.daysLikely}` : null,
    item.daysPessimistic != null ? `pessimistic ${item.daysPessimistic}` : null
  ].filter((s): s is string => s !== null);
  const rounded = Math.round(days);
  return { label: `~${rounded}d`, title: `About ${rounded} days (${points.join(', ')})` };
};

/** A size as a fraction of the biggest one shown. */
export const relativeSize = (days: number, max: number): number => (max > 0 ? Math.min(1, days / max) : 0);

export const SIZE_BAR_MAX = 20;
export const SIZE_BAR_MIN = 2;

/**
 * A size bar's height in px, on a square-root scale: small projects spread out
 * instead of bunching at the bottom beside one big one. Never too short to see.
 */
export const sizeBarHeight = (fraction: number, max: number = SIZE_BAR_MAX, min: number = SIZE_BAR_MIN): number =>
  Math.max(min, Math.round(Math.sqrt(Math.min(1, Math.max(0, fraction))) * max));
