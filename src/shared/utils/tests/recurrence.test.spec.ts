import { describe, it, expect } from 'vitest';
import { nextOccurrence } from '../recurrence';

const day = (d: Date) => d.toISOString().slice(0, 10);

describe('nextOccurrence', () => {
  it('adds a week, a month, a quarter or a year', () => {
    const from = new Date('2026-10-04T00:00:00Z');
    expect(day(nextOccurrence(from, 'WEEKLY'))).toBe('2026-10-11');
    expect(day(nextOccurrence(from, 'MONTHLY'))).toBe('2026-11-04');
    expect(day(nextOccurrence(from, 'QUARTERLY'))).toBe('2027-01-04');
    expect(day(nextOccurrence(from, 'YEARLY'))).toBe('2027-10-04');
  });

  it('clamps to the end of a shorter month', () => {
    expect(day(nextOccurrence(new Date('2027-01-31T00:00:00Z'), 'MONTHLY'))).toBe('2027-02-28');
    expect(day(nextOccurrence(new Date('2028-02-29T00:00:00Z'), 'YEARLY'))).toBe('2029-02-28');
  });
});
