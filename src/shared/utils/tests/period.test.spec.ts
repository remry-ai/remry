import { describe, it, expect } from 'vitest';
import { localDay, periodElapsed, periodOptions, periodPhase, periodRange, periodSpan } from '../period';

describe('periodRange', () => {
  it('covers whole calendar years, halves and quarters', () => {
    expect(periodRange('2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodRange('2026-H1')).toEqual({ start: '2026-01-01', end: '2026-06-30' });
    expect(periodRange('2026-H2')).toEqual({ start: '2026-07-01', end: '2026-12-31' });
    expect(periodRange('2026-Q3')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
  });

  it('ends Q1 on the last day of February in a leap year', () => {
    expect(periodRange('2028-Q1')).toEqual({ start: '2028-01-01', end: '2028-03-31' });
    expect(periodRange('2028-H1')?.end).toBe('2028-06-30');
  });

  it('rejects codes that are not periods', () => {
    expect(periodRange('2026-Q5')).toBeNull();
    expect(periodRange('H2')).toBeNull();
    expect(periodRange('')).toBeNull();
  });
});

describe('periodSpan', () => {
  it('names the months', () => {
    expect(periodSpan('2026-H2')).toBe('Jul–Dec 2026');
    expect(periodSpan('2026-Q1')).toBe('Jan–Mar 2026');
    expect(periodSpan('2026')).toBe('Jan–Dec 2026');
  });
});

describe('periodPhase', () => {
  it('counts the first and last days as inside', () => {
    expect(periodPhase('2026-Q3', '2026-06-30')).toBe('future');
    expect(periodPhase('2026-Q3', '2026-07-01')).toBe('current');
    expect(periodPhase('2026-Q3', '2026-09-30')).toBe('current');
    expect(periodPhase('2026-Q3', '2026-10-01')).toBe('past');
  });
});

describe('periodElapsed', () => {
  it('runs from 0 on the first day to 1 after the last', () => {
    expect(periodElapsed('2026', '2025-12-01')).toBe(0);
    expect(periodElapsed('2026', '2026-01-01')).toBe(0);
    expect(periodElapsed('2026-H2', '2026-10-01')).toBeCloseTo(92 / 184);
    expect(periodElapsed('2026', '2027-01-01')).toBe(1);
  });
});

describe('periodOptions', () => {
  it('offers last year, this year and next, and marks the current ones', () => {
    const options = periodOptions('2026-09-29');
    expect(options.map((o) => o.id)).toHaveLength(21);
    expect(options[0]).toEqual({ id: '2025', name: '2025 (full year)', group: '2025' });
    expect(options.find((o) => o.id === '2026-H2')?.name).toBe('2026-H2 (Jul–Dec) · now');
    expect(options.find((o) => o.id === '2026-Q4')?.name).toBe('2026-Q4 (Oct–Dec)');
  });

  it("keeps a goal's older period at the top", () => {
    expect(periodOptions('2026-09-29', '2023-Q2')[0]).toEqual({ id: '2023-Q2', name: '2023-Q2 (Apr–Jun)', group: '2023' });
    expect(periodOptions('2026-09-29', '2026-Q2')).toHaveLength(21);
  });
});

describe('localDay', () => {
  it('formats the local date', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
