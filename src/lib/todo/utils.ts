import type { EntityType as SharedEntityType } from '$shared/types/enums';
export type TodoStatus = 'PENDING' | 'ACTIVE' | 'COMPLETE' | 'CANCELLED';
export type EntityType = SharedEntityType;

export const nextStatus = (current: TodoStatus): TodoStatus => {
  switch (current) {
    case 'PENDING':
      return 'ACTIVE';
    case 'ACTIVE':
      return 'COMPLETE';
    default:
      return current;
  }
};

export const formatTodoDate = (d: Date | string | null): string => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-CA');
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const FULL = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' });

const toDate = (d: Date | string): Date => (typeof d === 'string' ? new Date(d) : d);

/** The whole due date, "Friday, September 18, 2026", read in UTC like `describeDueDate`. */
export const formatDueDateFull = (d: Date | string): string => FULL.format(toDate(d));

export interface DueDate {
  /** "Due today", "Due tomorrow", "Due in 3 days", "Due in 2 weeks", "Due 3 days ago" */
  readonly label: string;
  /** The day has passed. A todo due today isn't overdue yet. */
  readonly overdue: boolean;
}

/**
 * A due date relative to today: days up to two weeks out, then weeks, months and years.
 * Due dates are calendar days saved at UTC midnight, so the day is read in UTC and compared
 * with the local today.
 */
export const describeDueDate = (d: Date | string | null, now: Date = new Date()): DueDate | null => {
  if (!d) return null;
  const date = toDate(d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diff = Math.round((day - today) / DAY_MS);
  const days = Math.abs(diff);
  const relative =
    days < 14 ? RELATIVE.format(diff, 'day')
    : days < 60 ? RELATIVE.format(Math.round(diff / 7), 'week')
    : days < 365 ? RELATIVE.format(Math.round(diff / 30), 'month')
    : RELATIVE.format(Math.round(diff / 365), 'year');
  return { label: `Due ${relative}`, overdue: diff < 0 };
};

export const priorityLabel = (p: number): string => {
  switch (p) {
    case 1:
      return '!';
    case 2:
      return '!!';
    case 3:
      return '!!!';
    default:
      return '';
  }
};
