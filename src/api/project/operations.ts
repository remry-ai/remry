import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ArchiveFilter, OwnerType } from '$shared/types/enums';
import type { EntityOwner } from '$shared/types/owner';
import { entityPath } from '$shared/utils/entity';
import { wouldCreateCycle } from '$shared/utils/hierarchy';
import { toProjectStatus, unknownStatusMessage, type ProjectStatus } from '$shared/utils/project-status';
import { loadOwner, resolveOwnerInput, type OwnerInput } from '$api/_owners';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { archiveWhere, ensureWritable } from '$api/_archive';

// ----- Types -----

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string | null;
  readonly parentId: string | null;
  readonly owner: EntityOwner | null;
  readonly childCount: number;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly daysOptimistic: number | null;
  readonly daysLikely: number | null;
  readonly daysPessimistic: number | null;
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
}

export interface ProjectDetail {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly daysOptimistic: number | null;
  readonly daysLikely: number | null;
  readonly daysPessimistic: number | null;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly owner: EntityOwner | null;
  readonly children: readonly { readonly id: string; readonly name: string }[];
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const checkParent = async (
  reg: Pick<Registry, 'prisma'>,
  id: string | null,
  parentId: string
): Promise<Result<void>> => {
  const parent = await reg.prisma.project.findUnique({ where: { id: parentId }, select: { name: true } });
  if (!parent) return err(new Error(`Parent project ${parentId} not found`));
  if (id === null) return ok(undefined);

  const all = await reg.prisma.project.findMany({ select: { id: true, parentId: true } });
  const parents = new Map(all.map((p) => [p.id, p.parentId]));
  return wouldCreateCycle((projectId) => parents.get(projectId), id, parentId)
    ? err(new Error(`"${parent.name}" is this project or one of its sub-projects, so it can't be its parent`))
    : ok(undefined);
};

// ----- Operations -----

export interface ProjectFilters {
  readonly ownerType?: OwnerType;
  readonly ownerId?: string;
  readonly archived?: ArchiveFilter;
}

export const listProjects = async (
  reg: Pick<Registry, 'prisma'>,
  filters: ProjectFilters = {}
): Promise<Result<readonly ProjectSummary[]>> => {
  const projects = await reg.prisma.project.findMany({
    where: {
      ...archiveWhere(filters.archived),
      ...(filters.ownerType !== undefined && { ownerType: filters.ownerType }),
      ...(filters.ownerId !== undefined && { ownerId: filters.ownerId })
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { children: true } } }
  });
  return ok(await Promise.all(projects.map(async (p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    parentId: p.parentId,
    owner: await loadOwner(reg, p.ownerType, p.ownerId),
    childCount: p._count.children,
    startDate: p.startDate,
    endDate: p.endDate,
    daysOptimistic: p.daysOptimistic,
    daysLikely: p.daysLikely,
    daysPessimistic: p.daysPessimistic,
    path: entityPath('PROJECT', p.id),
    archivedAt: p.archivedAt,
    createdAt: p.createdAt
  }))));
};

export const getProject = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<ProjectDetail>> => {
  const project = await reg.prisma.project.findFirst({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true }, orderBy: { name: 'asc' } }
    }
  });
  if (!project) return err(new Error('Project not found'));

  return ok({
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    daysOptimistic: project.daysOptimistic,
    daysLikely: project.daysLikely,
    daysPessimistic: project.daysPessimistic,
    parentId: project.parentId,
    parentName: project.parent?.name ?? null,
    owner: await loadOwner(reg, project.ownerType, project.ownerId),
    children: project.children,
    path: entityPath('PROJECT', project.id),
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  });
};

interface CreateProjectInput extends OwnerInput {
  readonly name: string;
  readonly description?: string;
  readonly status?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly daysOptimistic?: number;
  readonly daysLikely?: number;
  readonly daysPessimistic?: number;
  readonly parentId?: string;
}

/** A status as given (a synonym such as `active` maps to `in-progress`), or an error naming the six. */
const resolveStatus = (value: string | null | undefined): Result<ProjectStatus | null | undefined> => {
  if (value === undefined) return ok(undefined);
  const status = toProjectStatus(value);
  return status === undefined ? err(new Error(unknownStatusMessage(value ?? ''))) : ok(status);
};

export const createProject = async (
  reg: Pick<Registry, 'prisma'>,
  input: CreateProjectInput
): Promise<Result<{ readonly id: string; readonly path: string }>> => {
  const status = resolveStatus(input.status);
  if (!status.ok) return err(status.error);
  const owner = await resolveOwnerInput(reg, input);
  if (!owner.ok) return err(owner.error);
  if (input.parentId) {
    const parent = await checkParent(reg, null, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  const project = await reg.prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      status: status.value ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      daysOptimistic: input.daysOptimistic,
      daysLikely: input.daysLikely,
      daysPessimistic: input.daysPessimistic,
      parentId: input.parentId,
      ownerType: owner.value?.ownerType ?? null,
      ownerId: owner.value?.ownerId ?? null
    }
  });
  return ok({ id: project.id, path: entityPath('PROJECT', project.id) });
};

export const updateProject = async (
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: OwnerInput & {
    readonly name?: string;
    readonly description?: string | null;
    readonly status?: string | null;
    readonly startDate?: Date | null;
    readonly endDate?: Date | null;
    readonly daysOptimistic?: number | null;
    readonly daysLikely?: number | null;
    readonly daysPessimistic?: number | null;
    readonly parentId?: string | null;
  }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.project.findFirst({ where: { id } });
  if (!existing) return err(new Error('Project not found'));
  const writable = await ensureWritable(reg, 'PROJECT', id);
  if (!writable.ok) return err(writable.error);

  const status = resolveStatus(input.status);
  if (!status.ok) return err(status.error);
  const owner = await resolveOwnerInput(reg, input);
  if (!owner.ok) return err(owner.error);
  if (input.parentId) {
    const parent = await checkParent(reg, id, input.parentId);
    if (!parent.ok) return err(parent.error);
  }

  await reg.prisma.project.update({
    where: { id },
    data: {
      ...(owner.value !== undefined && owner.value),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(status.value !== undefined && { status: status.value }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.daysOptimistic !== undefined && { daysOptimistic: input.daysOptimistic }),
      ...(input.daysLikely !== undefined && { daysLikely: input.daysLikely }),
      ...(input.daysPessimistic !== undefined && { daysPessimistic: input.daysPessimistic }),
      ...(input.parentId !== undefined && { parentId: input.parentId })
    }
  });
  return ok({ id });
};

/** Sub-projects move up to this project's parent; goal links, attached items and relations are deleted. */
export const deleteProject = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.project.findFirst({ where: { id } });
  if (!existing) return err(new Error('Project not found'));

  const cleanup = await planEntityCleanup(reg, 'PROJECT', id);
  await reg.prisma.$transaction([
    reg.prisma.project.updateMany({ where: { parentId: id }, data: { parentId: existing.parentId } }),
    reg.prisma.goalProject.deleteMany({ where: { projectId: id } }),
    ...cleanup.ops,
    reg.prisma.project.delete({ where: { id } })
  ]);
  await removeFiles(reg, cleanup.files);
  return ok({ deleted: true as const });
};
