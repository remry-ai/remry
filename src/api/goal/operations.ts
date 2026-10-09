import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ArchiveFilter, GoalStatus, OwnerType } from '$shared/types/enums';
import { goalProgress, type GoalCheckInItem, type GoalDetail, type GoalSummary } from '$shared/types/goals';
import { entityPath } from '$shared/utils/entity';
import { wouldCreateCycle } from '$shared/utils/hierarchy';
import { loadOwner, resolveOwnerInput, type OwnerInput } from '$api/_owners';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { archiveWhere, ensureAllWritable, ensureWritable } from '$api/_archive';

// ----- Row mapping -----

const ORDER = [{ sortOrder: 'asc' as const }, { title: 'asc' as const }];

// The latest check-in that recorded a value: the goal's current value.
const LATEST_VALUE = {
  where: { value: { not: null } },
  orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
  take: 1,
  select: { value: true }
};

interface GoalRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly ownerType: string | null;
  readonly ownerId: string | null;
  readonly parentId: string | null;
  readonly period: string | null;
  readonly status: string;
  readonly unit: string | null;
  readonly baseline: number | null;
  readonly target: number | null;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
  readonly checkIns: readonly { readonly value: number | null }[];
}

const toSummary = async (reg: Pick<Registry, 'prisma'>, row: GoalRow): Promise<GoalSummary> => {
  const current = row.checkIns[0]?.value ?? null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    owner: await loadOwner(reg, row.ownerType, row.ownerId),
    parentId: row.parentId,
    period: row.period,
    status: row.status as GoalStatus,
    unit: row.unit,
    baseline: row.baseline,
    target: row.target,
    current,
    progress: goalProgress({ baseline: row.baseline, target: row.target, current }),
    path: entityPath('GOAL', row.id),
    archivedAt: row.archivedAt,
    updatedAt: row.updatedAt
  };
};

const checkParent = async (
  reg: Pick<Registry, 'prisma'>,
  id: string | null,
  parentId: string
): Promise<Result<void>> => {
  const parent = await reg.prisma.goal.findUnique({ where: { id: parentId }, select: { title: true } });
  if (!parent) return err(new Error(`Parent goal ${parentId} not found`));
  if (id === null) return ok(undefined);

  const all = await reg.prisma.goal.findMany({ select: { id: true, parentId: true } });
  const parents = new Map(all.map((g) => [g.id, g.parentId]));
  return wouldCreateCycle((goalId) => parents.get(goalId), id, parentId)
    ? err(new Error(`"${parent.title}" is this goal or one of its sub-goals, so it can't be its parent`))
    : ok(undefined);
};

// ----- Queries -----

export interface GoalFilters {
  readonly ownerType?: OwnerType;
  readonly ownerId?: string;
  readonly period?: string;
  readonly status?: GoalStatus;
  /** null lists top-level goals. */
  readonly parentId?: string | null;
  readonly projectId?: string;
  readonly archived?: ArchiveFilter;
}

export const listGoals = async (
  reg: Pick<Registry, 'prisma'>,
  filters: GoalFilters
): Promise<Result<readonly GoalSummary[]>> => {
  const rows = await reg.prisma.goal.findMany({
    where: {
      ...archiveWhere(filters.archived),
      ...(filters.ownerType !== undefined && { ownerType: filters.ownerType }),
      ...(filters.ownerId !== undefined && { ownerId: filters.ownerId }),
      ...(filters.period !== undefined && { period: filters.period }),
      ...(filters.status !== undefined && { status: filters.status }),
      ...(filters.parentId !== undefined && { parentId: filters.parentId }),
      ...(filters.projectId !== undefined && { projects: { some: { projectId: filters.projectId } } })
    },
    orderBy: ORDER,
    include: { checkIns: LATEST_VALUE }
  });
  return ok(await Promise.all(rows.map((row) => toSummary(reg, row))));
};

export const getGoal = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<GoalDetail>> => {
  const row = await reg.prisma.goal.findUnique({
    where: { id },
    include: {
      checkIns: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
      parent: { select: { id: true, title: true } },
      children: { orderBy: ORDER, include: { checkIns: LATEST_VALUE } },
      projects: {
        orderBy: { createdAt: 'asc' },
        include: { project: { select: { id: true, name: true, status: true } } }
      }
    }
  });
  if (!row) return err(new Error(`Goal ${id} not found`));

  const latest = row.checkIns.filter((c) => c.value !== null).slice(0, 1);
  return ok({
    ...(await toSummary(reg, { ...row, checkIns: latest })),
    parent: row.parent,
    children: await Promise.all(row.children.map((child) => toSummary(reg, child))),
    checkIns: row.checkIns.map((c): GoalCheckInItem => ({
      id: c.id,
      date: c.date,
      value: c.value,
      status: c.status as GoalStatus | null,
      comment: c.comment,
      createdAt: c.createdAt
    })),
    projects: row.projects.map(({ project }) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      path: entityPath('PROJECT', project.id)
    })),
    createdAt: row.createdAt
  });
};

// ----- Mutations -----

export interface CreateGoalInput extends OwnerInput {
  readonly title: string;
  readonly description?: string;
  readonly parentId?: string;
  readonly period?: string;
  readonly status?: GoalStatus;
  readonly unit?: string;
  readonly baseline?: number;
  readonly target?: number;
}

export const createGoal = async (
  reg: Pick<Registry, 'prisma'>,
  input: CreateGoalInput
): Promise<Result<{ readonly id: string; readonly path: string }>> => {
  const owner = await resolveOwnerInput(reg, input);
  if (!owner.ok) return err(owner.error);
  if (input.parentId) {
    const parent = await checkParent(reg, null, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  const row = await reg.prisma.goal.create({
    data: {
      title: input.title,
      description: input.description,
      ownerType: owner.value?.ownerType ?? null,
      ownerId: owner.value?.ownerId ?? null,
      parentId: input.parentId,
      period: input.period,
      status: input.status,
      unit: input.unit,
      baseline: input.baseline,
      target: input.target
    }
  });
  return ok({ id: row.id, path: entityPath('GOAL', row.id) });
};

export interface UpdateGoalInput extends OwnerInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly parentId?: string | null;
  readonly period?: string | null;
  readonly status?: GoalStatus;
  readonly unit?: string | null;
  readonly baseline?: number | null;
  readonly target?: number | null;
}

export const updateGoal = async (
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: UpdateGoalInput
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.goal.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return err(new Error(`Goal ${id} not found`));
  const writable = await ensureWritable(reg, 'GOAL', id);
  if (!writable.ok) return err(writable.error);

  const owner = await resolveOwnerInput(reg, input);
  if (!owner.ok) return err(owner.error);
  if (input.parentId) {
    const parent = await checkParent(reg, id, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  await reg.prisma.goal.update({
    where: { id },
    data: {
      ...(owner.value !== undefined && owner.value),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.parentId !== undefined && { parentId: input.parentId }),
      ...(input.period !== undefined && { period: input.period }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.baseline !== undefined && { baseline: input.baseline }),
      ...(input.target !== undefined && { target: input.target })
    }
  });
  return ok({ id });
};

/** Sub-goals move up to this goal's parent; check-ins, project links and attached items are deleted. */
export const deleteGoal = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.goal.findUnique({ where: { id }, select: { parentId: true } });
  if (!existing) return err(new Error(`Goal ${id} not found`));

  const cleanup = await planEntityCleanup(reg, 'GOAL', id);
  await reg.prisma.$transaction([
    reg.prisma.goal.updateMany({ where: { parentId: id }, data: { parentId: existing.parentId } }),
    reg.prisma.goalCheckIn.deleteMany({ where: { goalId: id } }),
    reg.prisma.goalProject.deleteMany({ where: { goalId: id } }),
    ...cleanup.ops,
    reg.prisma.goal.delete({ where: { id } })
  ]);
  await removeFiles(reg, cleanup.files);
  return ok({ deleted: true as const });
};

// ----- Check-ins -----

export interface CheckInInput {
  readonly goalId: string;
  readonly date?: Date;
  readonly value?: number;
  readonly status?: GoalStatus;
  readonly comment?: string;
}

/** Records progress. A status on the check-in also becomes the goal's status. */
export const addCheckIn = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  input: CheckInInput
): Promise<Result<{ readonly id: string }>> => {
  if (input.value === undefined && input.status === undefined && !input.comment?.trim()) {
    return err(new Error('A check-in needs a value, a status or a comment'));
  }
  const goal = await reg.prisma.goal.findUnique({ where: { id: input.goalId }, select: { id: true } });
  if (!goal) return err(new Error(`Goal ${input.goalId} not found`));
  const writable = await ensureWritable(reg, 'GOAL', input.goalId);
  if (!writable.ok) return err(writable.error);

  const create = reg.prisma.goalCheckIn.create({
    data: {
      goalId: input.goalId,
      date: input.date ?? reg.now(),
      value: input.value ?? null,
      status: input.status ?? null,
      comment: input.comment?.trim() || null
    }
  });
  if (input.status === undefined) {
    const row = await create;
    return ok({ id: row.id });
  }
  const [row] = await reg.prisma.$transaction([
    create,
    reg.prisma.goal.update({ where: { id: input.goalId }, data: { status: input.status } })
  ]);
  return ok({ id: row.id });
};

export const removeCheckIn = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.goalCheckIn.findUnique({ where: { id }, select: { goalId: true } });
  if (!existing) return err(new Error(`Check-in ${id} not found`));
  const writable = await ensureWritable(reg, 'GOAL', existing.goalId);
  if (!writable.ok) return err(writable.error);
  await reg.prisma.goalCheckIn.delete({ where: { id } });
  return ok({ deleted: true as const });
};

// ----- Projects -----

/** Links a project to a goal. Linking twice is a no-op. */
export const addGoalProject = async (
  reg: Pick<Registry, 'prisma'>,
  goalId: string,
  projectId: string
): Promise<Result<{ readonly goalId: string; readonly projectId: string }>> => {
  const [goal, project] = await Promise.all([
    reg.prisma.goal.findUnique({ where: { id: goalId }, select: { id: true } }),
    reg.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  ]);
  if (!goal) return err(new Error(`Goal ${goalId} not found`));
  if (!project) return err(new Error(`Project ${projectId} not found`));
  const writable = await ensureAllWritable(reg, [['GOAL', goalId], ['PROJECT', projectId]]);
  if (!writable.ok) return err(writable.error);

  const link = { goalId, projectId };
  const existing = await reg.prisma.goalProject.findUnique({ where: { goalId_projectId: link } });
  if (!existing) await reg.prisma.goalProject.create({ data: link });
  return ok(link);
};

export const removeGoalProject = async (
  reg: Pick<Registry, 'prisma'>,
  goalId: string,
  projectId: string
): Promise<Result<{ readonly removed: true }>> => {
  const writable = await ensureAllWritable(reg, [['GOAL', goalId], ['PROJECT', projectId]]);
  if (!writable.ok) return err(writable.error);
  const { count } = await reg.prisma.goalProject.deleteMany({ where: { goalId, projectId } });
  if (count === 0) return err(new Error(`Project ${projectId} isn't linked to goal ${goalId}`));
  return ok({ removed: true as const });
};
