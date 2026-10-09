// Every project dependency and goal–project link in the notebook, for the
// projects dependency map. Edges to projects the caller doesn't list are its to
// drop: it already has the project list for the same archive filter.

import type { Registry } from '$shared/registry';
import { ok, type Result } from '$shared/utils';
import type { ArchiveFilter, GoalStatus } from '$shared/types/enums';
import { goalProgress } from '$shared/types/goals';
import type { DependencyGoal, ProjectDependencies } from '$shared/types/project-dependencies';
import { entityPath } from '$shared/utils/entity';
import { archiveWhere } from '$api/_archive';

// The latest check-in that recorded a value: the goal's current value.
const LATEST_VALUE = {
  where: { value: { not: null } },
  orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
  take: 1,
  select: { value: true }
};

export const listProjectDependencies = async (
  reg: Pick<Registry, 'prisma'>,
  archived: ArchiveFilter = 'exclude'
): Promise<Result<ProjectDependencies>> => {
  const [relations, links] = await Promise.all([
    reg.prisma.relation.findMany({
      where: { kind: 'DEPENDS_ON', fromType: 'PROJECT', toType: 'PROJECT' },
      select: { fromId: true, toId: true },
      orderBy: { createdAt: 'asc' }
    }),
    reg.prisma.goalProject.findMany({
      where: { goal: archiveWhere(archived) },
      select: {
        projectId: true,
        goal: {
          select: { id: true, title: true, status: true, baseline: true, target: true, checkIns: LATEST_VALUE }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  const goals = new Map<string, DependencyGoal>();
  for (const { goal } of links) {
    if (goals.has(goal.id)) continue;
    const current = goal.checkIns[0]?.value ?? null;
    goals.set(goal.id, {
      id: goal.id,
      title: goal.title,
      status: goal.status as GoalStatus,
      progress: goalProgress({ baseline: goal.baseline, target: goal.target, current }),
      path: entityPath('GOAL', goal.id)
    });
  }

  return ok({
    edges: relations,
    goals: [...goals.values()],
    goalLinks: links.map((l) => ({ goalId: l.goal.id, projectId: l.projectId }))
  });
};
