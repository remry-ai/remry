// The one line a project page shows for its sub-projects while they're folded.

import { PROJECT_STATUSES, isProjectStatus, projectStatusLabel } from '$shared/utils/project-status';

export interface StatusCount {
  /** The stored status, or null for none. */
  readonly status: string | null;
  readonly label: string;
  readonly count: number;
}

/** How many sub-projects have each status, in the statuses' own order; unknown ones and "no status" last. */
export const statusCounts = (projects: readonly { readonly status: string | null }[]): readonly StatusCount[] => {
  const counts = new Map<string | null, number>();
  for (const p of projects) {
    const key = p.status || null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rank = (status: string | null): number =>
    status === null ? PROJECT_STATUSES.length + 1 : isProjectStatus(status) ? PROJECT_STATUSES.indexOf(status) : PROJECT_STATUSES.length;
  return [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([status, count]) => ({ status, label: projectStatusLabel(status) ?? 'no status', count }));
};
