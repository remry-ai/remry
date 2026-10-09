// Group kinds are data: each notebook has its own (Team, Department, Family…).
// Modules seed theirs (`seedGroupKinds`); the user can add more.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import {
  GROUP_KIND_KEY,
  GROUP_KIND_KEY_RULE,
  type GroupKindDefinition,
  type GroupKindSummary
} from '$shared/types/groups';
import type { GroupKindSeed } from '$shared/modules/types';

type Reg = Pick<Registry, 'prisma'>;

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

const toDefinition = (row: GroupKindDefinition): GroupKindDefinition => ({
  key: row.key,
  name: row.name,
  plural: row.plural,
  exclusive: row.exclusive,
  sortOrder: row.sortOrder
});

const unknownKind = async (reg: Reg, key: string): Promise<Error> => {
  const rows = await reg.prisma.groupKind.findMany({ orderBy: ORDER, select: { key: true } });
  return new Error(
    `There is no group kind "${key}" in this notebook. Kinds: ${rows.map((r) => r.key).join(', ') || 'none yet'}. Create one with groupKind.create.`
  );
};

export const listGroupKinds = async (reg: Reg): Promise<Result<readonly GroupKindSummary[]>> => {
  const [rows, counts] = await Promise.all([
    reg.prisma.groupKind.findMany({ orderBy: ORDER }),
    reg.prisma.group.groupBy({ by: ['kind'], _count: { _all: true } })
  ]);
  return ok(rows.map((r) => ({ ...toDefinition(r), groupCount: counts.find((c) => c.kind === r.key)?._count._all ?? 0 })));
};

export const getGroupKind = async (reg: Reg, key: string): Promise<Result<GroupKindDefinition>> => {
  const row = await reg.prisma.groupKind.findUnique({ where: { key } });
  return row ? ok(toDefinition(row)) : err(await unknownKind(reg, key));
};

export interface CreateGroupKindInput {
  readonly key: string;
  readonly name: string;
  readonly plural?: string;
  readonly exclusive?: boolean;
}

const checkName = async (reg: Reg, name: string, exceptKey?: string): Promise<Result<void>> => {
  const rows = await reg.prisma.groupKind.findMany({ select: { key: true, name: true } });
  const same = rows.find((r) => r.key !== exceptKey && r.name.trim().toLowerCase() === name.trim().toLowerCase());
  return same ? err(new Error(`The group kind ${same.key} is already called "${same.name}". Pick another name.`)) : ok(undefined);
};

export const createGroupKind = async (reg: Reg, input: CreateGroupKindInput): Promise<Result<GroupKindDefinition>> => {
  if (!GROUP_KIND_KEY.test(input.key)) return err(new Error(`"${input.key}" can't be a group kind key. Use ${GROUP_KIND_KEY_RULE}.`));
  if (await reg.prisma.groupKind.findUnique({ where: { key: input.key }, select: { key: true } })) {
    return err(new Error(`There is already a group kind ${input.key}. Change it with groupKind.update.`));
  }
  const name = await checkName(reg, input.name);
  if (!name.ok) return err(name.error);
  const last = await reg.prisma.groupKind.aggregate({ _max: { sortOrder: true } });
  const row = await reg.prisma.groupKind.create({
    data: {
      key: input.key,
      name: input.name.trim(),
      plural: input.plural?.trim() || `${input.name.trim()}s`,
      exclusive: input.exclusive ?? false,
      sortOrder: (last._max.sortOrder ?? -1) + 1
    }
  });
  return ok(toDefinition(row));
};

export interface UpdateGroupKindInput {
  readonly name?: string;
  readonly plural?: string;
  readonly exclusive?: boolean;
  readonly sortOrder?: number;
}

/** Making a kind exclusive is refused while someone is in two groups of it, naming them. */
export const updateGroupKind = async (reg: Reg, key: string, input: UpdateGroupKindInput): Promise<Result<GroupKindDefinition>> => {
  const existing = await reg.prisma.groupKind.findUnique({ where: { key } });
  if (!existing) return err(await unknownKind(reg, key));
  if (input.name !== undefined) {
    const name = await checkName(reg, input.name, key);
    if (!name.ok) return err(name.error);
  }
  if (input.exclusive === true && !existing.exclusive) {
    const members = await reg.prisma.groupMember.findMany({
      where: { group: { kind: key } },
      select: { personId: true, person: { select: { name: true } } }
    });
    const seen = new Map<string, number>();
    for (const m of members) seen.set(m.personId, (seen.get(m.personId) ?? 0) + 1);
    const twice = [...new Set(members.filter((m) => (seen.get(m.personId) ?? 0) > 1).map((m) => m.person.name))];
    if (twice.length > 0) {
      return err(new Error(`${twice.join(', ')} ${twice.length === 1 ? 'is' : 'are'} in more than one ${existing.name.toLowerCase()}. Remove the extra memberships first.`));
    }
  }
  const row = await reg.prisma.groupKind.update({
    where: { key },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.plural !== undefined && { plural: input.plural.trim() }),
      ...(input.exclusive !== undefined && { exclusive: input.exclusive }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder })
    }
  });
  return ok(toDefinition(row));
};

/** Refuses while groups use the kind, unless `moveTo` names a kind to move them to. */
export const deleteGroupKind = async (
  reg: Reg,
  key: string,
  moveTo?: string
): Promise<Result<{ readonly deleted: true; readonly groupsMoved: number }>> => {
  if (!(await reg.prisma.groupKind.findUnique({ where: { key }, select: { key: true } }))) return err(await unknownKind(reg, key));
  const groups = await reg.prisma.group.findMany({ where: { kind: key }, select: { id: true, name: true } });
  if (groups.length > 0 && moveTo === undefined) {
    const names = groups.slice(0, 5).map((g) => `"${g.name}"`).join(', ');
    return err(new Error(`${groups.length} group(s) are ${key} (${names}). Pass moveTo with another kind to move them first.`));
  }
  if (moveTo !== undefined) {
    if (moveTo === key) return err(new Error('moveTo must be a different kind'));
    const target = await getGroupKind(reg, moveTo);
    if (!target.ok) return err(target.error);
  }
  await reg.prisma.$transaction([
    reg.prisma.group.updateMany({ where: { kind: key }, data: { kind: moveTo ?? key } }),
    reg.prisma.groupKind.delete({ where: { key } })
  ]);
  return ok({ deleted: true as const, groupsMoved: groups.length });
};

/** Adds the kinds a notebook's modules bring and it doesn't have yet. Returns the keys added. */
export const seedGroupKinds = async (reg: Reg, seeds: readonly GroupKindSeed[]): Promise<readonly string[]> => {
  const existing = new Set((await reg.prisma.groupKind.findMany({ select: { key: true } })).map((r) => r.key));
  const missing = seeds.filter((s) => !existing.has(s.key));
  for (const [i, seed] of missing.entries()) {
    await reg.prisma.groupKind.create({
      data: { key: seed.key, name: seed.name, plural: seed.plural, exclusive: seed.exclusive, sortOrder: existing.size + i }
    });
  }
  return missing.map((s) => s.key);
};
