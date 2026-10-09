import { describe, it, expect } from 'vitest';
import { GOAL_STATUSES } from '$shared/types/enums';
import { formatGoalValue, goalStatusBadgeClass, goalTimeFlag, paceValue, progressAxis, progressTone } from '../utils';

describe('goal status styling', () => {
  it('gives every status a badge and a tone', () => {
    for (const status of GOAL_STATUSES) {
      expect(goalStatusBadgeClass(status)).toMatch(/^badge/);
      expect(['accent', 'success', 'warning', 'danger']).toContain(progressTone(status));
    }
  });

  it('marks risk in warning and danger colours', () => {
    expect(goalStatusBadgeClass('AT_RISK')).toBe('badge warning');
    expect(progressTone('OFF_TRACK')).toBe('danger');
  });
});

describe('formatGoalValue', () => {
  it('attaches percentages and spaces other units', () => {
    expect(formatGoalValue(3, '%')).toBe('3%');
    expect(formatGoalValue(12, 'deals')).toBe('12 deals');
    expect(formatGoalValue(7, null)).toBe('7');
    expect(formatGoalValue(null, '%')).toBe('—');
  });
});

describe('progressAxis', () => {
  it('scales to the data when a zero-based axis would flatten it', () => {
    // 99.5–99.9% uptime is a straight line across the top of a 0–100 axis.
    const axis = progressAxis([99.5, 99.55, 99.72, 99.68, 99.9]);
    expect(axis).not.toBeNull();
    expect(axis!.min).toBeGreaterThan(99);
    expect(axis!.min).toBeLessThan(99.5);
    expect(axis!.max).toBeGreaterThan(99.9);
  });

  it('keeps a zero floor when the data already fills the axis', () => {
    // p95 latency from 480ms down to a 200ms target reads fine from zero.
    expect(progressAxis([480, 390, 310, 200])).toBeNull();
  });

  it('keeps a zero floor for values that reach or pass zero', () => {
    expect(progressAxis([0, 40, 90])).toBeNull();
    expect(progressAxis([-5, 10])).toBeNull();
  });

  it('opens a window around a series that never moves', () => {
    const axis = progressAxis([99.9, 99.9]);
    expect(axis).not.toBeNull();
    expect(axis!.min).toBeLessThan(99.9);
    expect(axis!.max).toBeGreaterThan(99.9);
  });

  it('pads the range it returns on both sides', () => {
    const axis = progressAxis([200, 210]);
    expect(axis!.min).toBeLessThan(200);
    expect(axis!.max).toBeGreaterThan(210);
  });

  it('has nothing to say about an empty series', () => {
    expect(progressAxis([])).toBeNull();
  });
});

describe('goalTimeFlag', () => {
  const goal = { period: '2026-H2', status: 'ON_TRACK' as const, progress: 0.2 };

  it('flags an open goal whose period is over', () => {
    expect(goalTimeFlag(goal, '2027-01-01')).toBe('ended');
    expect(goalTimeFlag({ ...goal, status: 'DONE' }, '2027-01-01')).toBeNull();
    expect(goalTimeFlag({ ...goal, status: 'DROPPED' }, '2027-01-01')).toBeNull();
  });

  it('flags progress trailing the time elapsed by more than the slack', () => {
    // About half of H2 has gone by on 1 October.
    expect(goalTimeFlag(goal, '2026-10-01')).toBe('behind');
    expect(goalTimeFlag({ ...goal, progress: 0.45 }, '2026-10-01')).toBeNull();
    expect(goalTimeFlag({ ...goal, progress: null }, '2026-10-01')).toBeNull();
  });

  it('leaves goals without a period, or not started yet, alone', () => {
    expect(goalTimeFlag({ ...goal, period: null }, '2026-10-01')).toBeNull();
    expect(goalTimeFlag(goal, '2026-03-01')).toBeNull();
  });
});

describe('paceValue', () => {
  it('moves from baseline to target across the period', () => {
    expect(paceValue(10, 20, '2026', '2026-01-01')).toBe(10);
    expect(paceValue(10, 20, '2026', '2027-01-01')).toBe(20);
    expect(paceValue(99.5, 99.9, '2026-H2', '2026-10-01')).toBeCloseTo(99.5 + 0.4 * (92 / 184));
  });
});
