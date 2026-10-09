// Goals: owned by a person, team or department, cascading through parentId,
// optionally measured (unit, baseline, target) and tracked with check-ins.

import type { GoalStatus } from './enums';
import type { EntityOwner } from './owner';

/** `2026`, `2026-H2` or `2026-Q3`. */
export const GOAL_PERIOD_PATTERN = /^\d{4}(?:-(?:H[12]|Q[1-4]))?$/;

export interface GoalSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly owner: EntityOwner | null;
  readonly parentId: string | null;
  readonly period: string | null;
  readonly status: GoalStatus;
  readonly unit: string | null;
  readonly baseline: number | null;
  readonly target: number | null;
  /** The value of the latest check-in that recorded one. */
  readonly current: number | null;
  /** 0–1 from baseline to target, or null when the goal isn't measured yet. */
  readonly progress: number | null;
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
}

export interface GoalCheckInItem {
  readonly id: string;
  readonly date: Date;
  readonly value: number | null;
  readonly status: GoalStatus | null;
  readonly comment: string | null;
  readonly createdAt: Date;
}

export interface GoalProjectLink {
  readonly id: string;
  readonly name: string;
  readonly status: string | null;
  readonly path: string;
}

export interface GoalDetail extends GoalSummary {
  readonly parent: { readonly id: string; readonly title: string } | null;
  readonly children: readonly GoalSummary[];
  /** Newest first. */
  readonly checkIns: readonly GoalCheckInItem[];
  readonly projects: readonly GoalProjectLink[];
  readonly createdAt: Date;
}

/**
 * How far `current` has moved from `baseline` (default 0) toward `target`,
 * clamped to 0–1. Works for goals that go down as well as up. Null without a
 * target or a current value.
 */
export const goalProgress = (input: {
  readonly baseline: number | null;
  readonly target: number | null;
  readonly current: number | null;
}): number | null => {
  const baseline = input.baseline ?? 0;
  const { target, current } = input;
  if (target === null || current === null || target === baseline) return null;
  const ratio = (current - baseline) / (target - baseline);
  return Math.min(1, Math.max(0, ratio));
};
