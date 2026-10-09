// The projects dependency map: which projects depend on which, and which goals
// each project delivers. Projects come from project.list; this adds the links.

import type { GoalStatus } from './enums';

export interface ProjectDependencyEdge {
  /** The project that depends on `toId`. */
  readonly fromId: string;
  readonly toId: string;
}

export interface DependencyGoal {
  readonly id: string;
  readonly title: string;
  readonly status: GoalStatus;
  /** 0–1 from baseline to target, or null when the goal isn't measured yet. */
  readonly progress: number | null;
  readonly path: string;
}

export interface GoalProjectEdge {
  readonly goalId: string;
  readonly projectId: string;
}

export interface ProjectDependencies {
  readonly edges: readonly ProjectDependencyEdge[];
  readonly goals: readonly DependencyGoal[];
  readonly goalLinks: readonly GoalProjectEdge[];
}
