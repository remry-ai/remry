import { describe, it, expect } from 'vitest';
import { GOAL_PERIOD_PATTERN, goalProgress } from '../goals';

describe('goalProgress', () => {
  it('measures from the baseline toward the target', () => {
    expect(goalProgress({ baseline: 10, target: 20, current: 15 })).toBe(0.5);
  });

  it('treats a missing baseline as 0', () => {
    expect(goalProgress({ baseline: null, target: 200, current: 50 })).toBe(0.25);
  });

  it('works for goals that go down', () => {
    expect(goalProgress({ baseline: 100, target: 20, current: 60 })).toBe(0.5);
  });

  it('clamps to 0–1', () => {
    expect(goalProgress({ baseline: 0, target: 10, current: 15 })).toBe(1);
    expect(goalProgress({ baseline: 0, target: 10, current: -5 })).toBe(0);
  });

  it('is null without a target, a current value or a range', () => {
    expect(goalProgress({ baseline: 0, target: null, current: 5 })).toBeNull();
    expect(goalProgress({ baseline: 0, target: 10, current: null })).toBeNull();
    expect(goalProgress({ baseline: 10, target: 10, current: 10 })).toBeNull();
  });
});

describe('GOAL_PERIOD_PATTERN', () => {
  it('accepts years, halves and quarters only', () => {
    expect(['2026', '2026-H2', '2026-Q3'].every((p) => GOAL_PERIOD_PATTERN.test(p))).toBe(true);
    expect(['2026-Q5', '26', '2026-h1', 'Q3 2026'].some((p) => GOAL_PERIOD_PATTERN.test(p))).toBe(false);
  });
});
