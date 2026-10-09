// Recurring todos: when one is completed, the next is due one interval after
// the last due date (or after it was completed, if it had none).

import type { TodoRecurrence } from '$shared/types/enums';

const MONTHS: Readonly<Record<Exclude<TodoRecurrence, 'WEEKLY'>, number>> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

/** Adds months in UTC, keeping the day but clamping to the month's end (31 Jan + 1 month = 28 or 29 Feb). */
const addMonths = (date: Date, months: number): Date => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
};

export const nextOccurrence = (from: Date, recurrence: TodoRecurrence): Date =>
  recurrence === 'WEEKLY' ? new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000) : addMonths(from, MONTHS[recurrence]);

export const RECURRENCE_LABELS: Readonly<Record<TodoRecurrence, string>> = {
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
  QUARTERLY: 'Every 3 months',
  YEARLY: 'Every year'
};
