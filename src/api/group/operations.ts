// Groups: teams, departments, families, friend groups — any set of people, of a
// kind the notebook defines. Membership is many-to-many; adding someone to a
// group of an exclusive kind takes them out of their other group of that kind.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { ArchiveFilter } from '$shared/types/enums';
import type { GroupDetail, GroupMemberEntry, GroupSummary, GroupWithMembers, PersonGroup } from '$shared/types/groups';
import { entityPath } from '$shared/utils/entity';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { archiveWhere, ensureAllWritable, ensureWritable } from '$api/_archive';
import { getGroupKind } from '$api/group-kind/operations';

type Reg = Pick<Registry, 'prisma'>;

const notFound = (id: string): Error => new Error(`Group ${id} not found. Find ids with group.list.`);

interface GroupRow {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly description: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly groupKind: { readonly name: string };
  readonly _count: { readonly members: number };
}

const SUMMARY = {
  groupKind: { select: { name: true } },
  _count: { select: { members: true } }
} as const;

const toSummary = (row: GroupRow): GroupSummary => ({
  id: row.id,
  kind: row.kind,
  kindName: row.groupKind.name,
  name: row.name,
  description: row.description,
  memberCount: row._count.members,
  path: entityPath('GROUP', row.id),
  archivedAt: row.archivedAt,
  createdAt: row.createdAt
});

const MEMBERS = { include: { person: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } };

const toMember = (m: { readonly id: string; readonly personId: string; readonly person: { readonly name: string } }): GroupMemberEntry => ({
  id: m.id,
  personId: m.personId,
  personName: m.person.name
});

// ----- Queries -----

export interface GroupFilters {
  readonly kind?: string;
  readonly archived?: ArchiveFilter;
}

const ORDER = [{ groupKind: { sortOrder: 'asc' as const } }, { name: 'asc' as const }];

export const listGroups = async (reg: Reg, filters: GroupFilters = {}): Promise<Result<readonly GroupSummary[]>> => {
  const rows = await reg.prisma.group.findMany({
    where: { ...archiveWhere(filters.archived), ...(filters.kind !== undefined && { kind: filters.kind }) },
    orderBy: ORDER,
    include: SUMMARY
  });
  return ok(rows.map(toSummary));
};

/** For the org map: archived people are left out of member lists. */
export const listGroupsWithMembers = async (reg: Reg, filters: GroupFilters = {}): Promise<Result<readonly GroupWithMembers[]>> => {
  const rows = await reg.prisma.group.findMany({
    where: { ...archiveWhere(filters.archived), ...(filters.kind !== undefined && { kind: filters.kind }) },
    orderBy: ORDER,
    include: { ...SUMMARY, members: { ...MEMBERS, where: { person: { archivedAt: null } } } }
  });
  return ok(rows.map((r) => ({ ...toSummary(r), members: r.members.map(toMember) })));
};

export const getGroup = async (reg: Reg, id: string): Promise<Result<GroupDetail>> => {
  const row = await reg.prisma.group.findUnique({
    where: { id },
    include: { ...SUMMARY, groupKind: { select: { name: true, exclusive: true } }, members: MEMBERS }
  });
  if (!row) return err(notFound(id));
  return ok({ ...toSummary(row), exclusive: row.groupKind.exclusive, updatedAt: row.updatedAt, members: row.members.map(toMember) });
};

/** A person's groups, by kind order then name. */
export const listPersonGroups = async (reg: Reg, personId: string): Promise<readonly PersonGroup[]> => {
  const rows = await reg.prisma.groupMember.findMany({
    where: { personId },
    include: { group: { select: { id: true, name: true, kind: true, groupKind: { select: { name: true, sortOrder: true } } } } }
  });
  return rows
    .map((r) => ({ ...r.group, sortOrder: r.group.groupKind.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((g) => ({ id: g.id, name: g.name, kind: g.kind, kindName: g.groupKind.name, path: entityPath('GROUP', g.id) }));
};

// ----- Mutations -----

export interface CreateGroupInput {
  readonly kind: string;
  readonly name: string;
  readonly description?: string;
}

export const createGroup = async (reg: Reg, input: CreateGroupInput): Promise<Result<{ readonly id: string; readonly path: string }>> => {
  const kind = await getGroupKind(reg, input.kind);
  if (!kind.ok) return err(kind.error);
  const row = await reg.prisma.group.create({ data: { kind: kind.value.key, name: input.name, description: input.description } });
  return ok({ id: row.id, path: entityPath('GROUP', row.id) });
};

export interface UpdateGroupInput {
  readonly name?: string;
  readonly description?: string | null;
  /** Moving to an exclusive kind is refused while a member is already in another group of it. */
  readonly kind?: string;
}

export const updateGroup = async (reg: Reg, id: string, input: UpdateGroupInput): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.group.findUnique({ where: { id }, select: { kind: true } });
  if (!existing) return err(notFound(id));
  const writable = await ensureWritable(reg, 'GROUP', id);
  if (!writable.ok) return err(writable.error);

  if (input.kind !== undefined && input.kind !== existing.kind) {
    const kind = await getGroupKind(reg, input.kind);
    if (!kind.ok) return err(kind.error);
    if (kind.value.exclusive) {
      const clash = await reg.prisma.groupMember.findFirst({
        where: { group: { kind: kind.value.key, id: { not: id } }, person: { groupMemberships: { some: { groupId: id } } } },
        select: { person: { select: { name: true } }, group: { select: { name: true } } }
      });
      if (clash) {
        return err(new Error(`${clash.person.name} is already in ${clash.group.name}, and a person is in one ${kind.value.name.toLowerCase()} at most.`));
      }
    }
  }

  await reg.prisma.group.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.kind !== undefined && { kind: input.kind })
    }
  });
  return ok({ id });
};

/** Also deletes what's attached to the group and its relations, and clears it as an owner. */
export const deleteGroup = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  if (!(await reg.prisma.group.findUnique({ where: { id }, select: { id: true } }))) return err(notFound(id));
  const cleanup = await planEntityCleanup(reg, 'GROUP', id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.group.delete({ where: { id } })]);
  await removeFiles(reg, cleanup.files);
  return ok({ deleted: true as const });
};

// ----- Membership -----

export const listGroupMembers = async (reg: Reg, groupId: string): Promise<Result<readonly GroupMemberEntry[]>> => {
  if (!(await reg.prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }))) return err(notFound(groupId));
  const members = await reg.prisma.groupMember.findMany({ where: { groupId }, ...MEMBERS });
  return ok(members.map(toMember));
};

/** In an exclusive kind, the person leaves their other group of that kind (returned as `replaced`). */
export const addGroupMember = async (
  reg: Reg,
  groupId: string,
  personId: string
): Promise<Result<{ readonly id: string; readonly replaced: readonly string[] }>> => {
  const group = await reg.prisma.group.findUnique({ where: { id: groupId }, select: { kind: true, groupKind: { select: { exclusive: true } } } });
  if (!group) return err(notFound(groupId));
  if (!(await reg.prisma.person.findUnique({ where: { id: personId }, select: { id: true } }))) {
    return err(new Error(`Person ${personId} not found. Find ids with person.list.`));
  }
  const writable = await ensureAllWritable(reg, [['GROUP', groupId], ['PERSON', personId]]);
  if (!writable.ok) return err(writable.error);

  const others = group.groupKind.exclusive
    ? await reg.prisma.groupMember.findMany({
      where: { personId, groupId: { not: groupId }, group: { kind: group.kind } },
      select: { id: true, group: { select: { name: true } } }
    })
    : [];
  const [, member] = await reg.prisma.$transaction([
    reg.prisma.groupMember.deleteMany({ where: { id: { in: others.map((o) => o.id) } } }),
    reg.prisma.groupMember.upsert({
      where: { groupId_personId: { groupId, personId } },
      create: { groupId, personId },
      update: {}
    })
  ]);
  return ok({ id: member.id, replaced: others.map((o) => o.group.name) });
};

export const removeGroupMember = async (reg: Reg, groupId: string, personId: string): Promise<Result<{ readonly deleted: true }>> => {
  if (!(await reg.prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }))) return err(notFound(groupId));
  const writable = await ensureAllWritable(reg, [['GROUP', groupId], ['PERSON', personId]]);
  if (!writable.ok) return err(writable.error);
  await reg.prisma.groupMember.deleteMany({ where: { groupId, personId } });
  return ok({ deleted: true as const });
};
