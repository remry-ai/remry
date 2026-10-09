// Smoke test: project.dependencies lists project dependencies and goal links,
// with each goal's status and progress, and follows the archive filter for goals.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { listProjectDependencies } from '../../src/api/project/dependencies';
import { TEST_NOTEBOOK } from './test-notebooks';

describe('project dependencies', () => {
  it('edges, goal links, goal progress, archived goals', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);
    const p = reg.prisma;

    const [a, b, c] = await Promise.all(['Dep A', 'Dep B', 'Dep C'].map((name) => p.project.create({ data: { name } })));
    await p.relation.create({ data: { fromType: 'PROJECT', fromId: a!.id, toType: 'PROJECT', toId: b!.id, kind: 'DEPENDS_ON' } });
    await p.relation.create({ data: { fromType: 'PROJECT', fromId: b!.id, toType: 'PROJECT', toId: c!.id, kind: 'DEPENDS_ON' } });
    await p.relation.create({ data: { fromType: 'PROJECT', fromId: a!.id, toType: 'PROJECT', toId: c!.id, kind: 'RELATED' } });

    const goal = await p.goal.create({ data: { title: 'Dep Goal', status: 'AT_RISK', baseline: 0, target: 10 } });
    await p.goalCheckIn.create({ data: { goalId: goal.id, date: new Date('2026-09-01'), value: 4 } });
    await p.goalProject.create({ data: { goalId: goal.id, projectId: a!.id } });
    const archivedGoal = await p.goal.create({ data: { title: 'Dep Old Goal', archivedAt: new Date() } });
    await p.goalProject.create({ data: { goalId: archivedGoal.id, projectId: b!.id } });

    const result = await listProjectDependencies(reg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const deps = result.value;

    expect(deps.edges).toEqual(expect.arrayContaining([{ fromId: a!.id, toId: b!.id }, { fromId: b!.id, toId: c!.id }]));
    expect(deps.edges).not.toContainEqual({ fromId: a!.id, toId: c!.id });
    expect(deps.goalLinks).toContainEqual({ goalId: goal.id, projectId: a!.id });
    expect(deps.goals.find((g) => g.id === goal.id)).toMatchObject({ status: 'AT_RISK', progress: 0.4, path: `/app/goals/${goal.id}` });
    expect(deps.goals.some((g) => g.id === archivedGoal.id)).toBe(false);

    const all = await listProjectDependencies(reg, 'include');
    expect(all.ok && all.value.goals.some((g) => g.id === archivedGoal.id)).toBe(true);
  });
});
