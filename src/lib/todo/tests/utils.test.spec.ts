import { describe, it, expect } from 'vitest';
import { describeDueDate, formatDueDateFull } from '../utils';

// A local afternoon, so local and UTC agree on the day in any time zone the tests run in.
const now = new Date(2026, 8, 13, 15, 0); // Sunday 13 September 2026
const due = (iso: string): Date => new Date(iso); // how TodoForm saves a date: UTC midnight

describe('describeDueDate', () => {
  it('counts days until the due date', () => {
    expect(describeDueDate(due('2026-09-13'), now)).toEqual({ label: 'Due today', overdue: false });
    expect(describeDueDate(due('2026-09-14'), now)).toEqual({ label: 'Due tomorrow', overdue: false });
    expect(describeDueDate(due('2026-09-16'), now)).toEqual({ label: 'Due in 3 days', overdue: false });
  });

  it('marks a passed due date overdue', () => {
    expect(describeDueDate(due('2026-09-12'), now)).toEqual({ label: 'Due yesterday', overdue: true });
    expect(describeDueDate(due('2026-09-10'), now)).toEqual({ label: 'Due 3 days ago', overdue: true });
  });

  it('switches to weeks, months and years further out', () => {
    expect(describeDueDate(due('2026-09-27'), now)?.label).toBe('Due in 2 weeks');
    expect(describeDueDate(due('2026-12-13'), now)?.label).toBe('Due in 3 months');
    expect(describeDueDate(due('2028-09-13'), now)?.label).toBe('Due in 2 years');
    expect(describeDueDate(due('2026-08-01'), now)).toEqual({ label: 'Due 6 weeks ago', overdue: true });
    expect(describeDueDate(due('2026-07-01'), now)).toEqual({ label: 'Due 2 months ago', overdue: true });
  });

  it('accepts a serialized date and returns nothing without one', () => {
    expect(describeDueDate('2026-09-14T00:00:00.000Z', now)?.label).toBe('Due tomorrow');
    expect(describeDueDate(null, now)).toBeNull();
  });
});

describe('formatDueDateFull', () => {
  it('spells out the whole date on the saved day, whatever the time zone', () => {
    expect(formatDueDateFull(due('2026-09-18'))).toBe('Friday, September 18, 2026');
  });
});
