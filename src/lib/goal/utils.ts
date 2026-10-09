import type { GoalStatus } from '$shared/types/enums';
import { periodElapsed, periodPhase } from '$shared/utils/period';

export const GOAL_STATUS_LABELS: Readonly<Record<GoalStatus, string>> = {
  NOT_STARTED: 'Not started',
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  OFF_TRACK: 'Off track',
  DONE: 'Done',
  DROPPED: 'Dropped'
};

export const goalStatusBadgeClass = (status: GoalStatus): string => {
  switch (status) {
    case 'ON_TRACK':
      return 'badge success';
    case 'AT_RISK':
      return 'badge warning';
    case 'OFF_TRACK':
      return 'badge danger';
    case 'DONE':
      return 'badge accent';
    case 'DROPPED':
      return 'badge muted';
    default:
      return 'badge';
  }
};

/** ProgressBar tone for a goal's status. */
export const progressTone = (status: GoalStatus): 'accent' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'ON_TRACK':
    case 'DONE':
      return 'success';
    case 'AT_RISK':
      return 'warning';
    case 'OFF_TRACK':
      return 'danger';
    default:
      return 'accent';
  }
};

/** `3` with unit `%` → `3%`; with `deals` → `3 deals`; no value → `—`. */
export const formatGoalValue = (value: number | null, unit: string | null): string => {
  if (value === null) return '—';
  const n = value.toLocaleString();
  if (!unit) return n;
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
};

/** The y-axis bounds for a goal's check-in chart, or `null` to start the axis at zero. */
export interface ProgressAxis {
  readonly min: number;
  readonly max: number;
}

/**
 * A zero-based axis is right for most goals, but it flattens a metric that lives
 * far from zero in a narrow band: 99.5% to 99.9% uptime is a straight line across
 * the top of a 0–100 axis. When a zero-based axis would squash the data into less
 * than a quarter of its height, scale to the data instead, with a little padding.
 *
 * Returns `null` when zero is the better floor, which is also the case for any
 * series that reaches zero or goes negative.
 */
export const progressAxis = (values: readonly number[]): ProgressAxis | null => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  if (lo <= 0) return null;

  const span = hi - lo;
  // Every value is the same: open a small window around it so the line isn't on an edge.
  if (span === 0) {
    const pad = Math.abs(hi) * 0.01 || 1;
    return { min: hi - pad, max: hi + pad };
  }
  if (span / hi >= 0.25) return null;

  const pad = span * 0.15;
  return { min: lo - pad, max: hi + pad };
};

export type GoalTimeFlag = 'ended' | 'behind';

/** How far progress may trail the time elapsed before a goal reads as behind pace. */
const PACE_SLACK = 0.1;

interface TimedGoal {
  readonly period: string | null;
  readonly status: GoalStatus;
  readonly progress: number | null;
}

/**
 * A hint about a goal's period, never a status change: `ended` when the period
 * is over and the goal isn't done or dropped, `behind` when a measured goal's
 * progress trails the time elapsed by more than PACE_SLACK.
 */
export const goalTimeFlag = (goal: TimedGoal, today: string): GoalTimeFlag | null => {
  if (!goal.period || goal.status === 'DONE' || goal.status === 'DROPPED') return null;
  const phase = periodPhase(goal.period, today);
  if (phase === 'past') return 'ended';
  const elapsed = periodElapsed(goal.period, today);
  if (phase === 'current' && goal.progress !== null && elapsed !== null && goal.progress + PACE_SLACK < elapsed) return 'behind';
  return null;
};

export const GOAL_TIME_FLAGS: Readonly<Record<GoalTimeFlag, { readonly label: string; readonly badge: string }>> = {
  ended: { label: 'Period ended', badge: 'badge danger' },
  behind: { label: 'Behind pace', badge: 'badge warning' }
};

/** Where a measured goal should be on `day` to reach its target by the period's end. */
export const paceValue = (baseline: number, target: number, period: string, day: string): number | null => {
  const elapsed = periodElapsed(period, day);
  return elapsed === null ? null : baseline + (target - baseline) * elapsed;
};
