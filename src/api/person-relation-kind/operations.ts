// Person relation kinds are data: each notebook has its own (Parent of / Child of,
// Lead of / Reports to, Partner of…). Modules seed theirs (`seedPersonRelationKinds`);
// the user can add more.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import {
  PERSON_RELATION_KIND_KEY,
  orderedEnds,
  type PersonRelationKindDefinition,
  type PersonRelationKindSummary
} from '$shared/types/person-relations';
import type { PersonRelationKindSeed } from '$shared/modules/types';

type Reg = Pick<Registry, 'prisma'>;

const ORDER = [{ sortOrder: 'asc' as const }, { label: 'asc' as const }];

const toDefinition = (row: PersonRelationKindDefinition): PersonRelationKindDefinition => ({
  key: row.key,
  label: row.label,
  inverseLabel: row.inverseLabel,
  symmetric: row.symmetric,
  exclusive: row.exclusive,
  sortOrder: row.sortOrder
});

export const loadPersonRelationKinds = async (reg: Reg): Promise<readonly PersonRelationKindDefinition[]> =>
  (await reg.prisma.personRelationKind.findMany({ orderBy: ORDER })).map(toDefinition);

const unknownKind = async (reg: Reg, key: string): Promise<Error> => {
  const keys = (await loadPersonRelationKinds(reg)).map((k) => k.key);
  return new Error(
    `There is no person relation kind "${key}" in this notebook. Kinds: ${keys.join(', ') || 'none yet'}. Create one with personRelationKind.create.`
  );
};

export const listPersonRelationKinds = async (reg: Reg): Promise<Result<readonly PersonRelationKindSummary[]>> => {
  const [kinds, counts] = await Promise.all([
    loadPersonRelationKinds(reg),
    reg.prisma.personRelation.groupBy({ by: ['kind'], _count: { _all: true } })
  ]);
  return ok(kinds.map((k) => ({ ...k, relationCount: counts.find((c) => c.kind === k.key)?._count._all ?? 0 })));
};

/** A kind by key. The error lists the notebook's kinds. */
export const getPersonRelationKind = async (reg: Reg, key: string): Promise<Result<PersonRelationKindDefinition>> => {
  const row = await reg.prisma.personRelationKind.findUnique({ where: { key } });
  return row ? ok(toDefinition(row)) : err(await unknownKind(reg, key));
};

export interface CreatePersonRelationKindInput {
  readonly key: string;
  readonly label: string;
  /** Leave out for a kind that reads the same both ways. */
  readonly inverseLabel?: string;
  readonly exclusive?: boolean;
}

export const createPersonRelationKind = async (
  reg: Reg,
  input: CreatePersonRelationKindInput
): Promise<Result<PersonRelationKindDefinition>> => {
  if (!PERSON_RELATION_KIND_KEY.test(input.key)) {
    return err(new Error(`"${input.key}" can't be a kind key. Use capital letters, digits and underscores, starting with a letter (like MENTOR_OF), at most 40.`));
  }
  if (await reg.prisma.personRelationKind.findUnique({ where: { key: input.key }, select: { key: true } })) {
    return err(new Error(`There is already a person relation kind ${input.key}.`));
  }
  const symmetric = !input.inverseLabel?.trim();
  if (symmetric && input.exclusive) {
    return err(new Error('A kind that reads the same both ways can\'t be one each; give it an inverseLabel ("Lead of" / "Reports to")'));
  }
  const last = await reg.prisma.personRelationKind.aggregate({ _max: { sortOrder: true } });
  const label = input.label.trim();
  const row = await reg.prisma.personRelationKind.create({
    data: {
      key: input.key,
      label,
      inverseLabel: symmetric ? label : input.inverseLabel!.trim(),
      symmetric,
      exclusive: input.exclusive ?? false,
      sortOrder: (last._max.sortOrder ?? -1) + 1
    }
  });
  return ok(toDefinition(row));
};

export interface UpdatePersonRelationKindInput {
  readonly label?: string;
  readonly inverseLabel?: string;
  readonly sortOrder?: number;
}

/** Labels and order change freely; direction and one-each are set when the kind is created. */
export const updatePersonRelationKind = async (
  reg: Reg,
  key: string,
  input: UpdatePersonRelationKindInput
): Promise<Result<PersonRelationKindDefinition>> => {
  const existing = await reg.prisma.personRelationKind.findUnique({ where: { key } });
  if (!existing) return err(await unknownKind(reg, key));
  const label = input.label?.trim() ?? existing.label;
  const row = await reg.prisma.personRelationKind.update({
    where: { key },
    data: {
      label,
      inverseLabel: existing.symmetric ? label : (input.inverseLabel?.trim() ?? existing.inverseLabel),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder })
    }
  });
  return ok(toDefinition(row));
};

/**
 * Refuses while relationships use the kind, unless `moveTo` names another kind
 * (not a one-each kind) to move them to. A moved relationship that would repeat
 * one the pair already has is dropped.
 */
export const deletePersonRelationKind = async (
  reg: Reg,
  key: string,
  moveTo?: string
): Promise<Result<{ readonly deleted: true; readonly relationsMoved: number; readonly relationsDropped: number }>> => {
  if (!(await reg.prisma.personRelationKind.findUnique({ where: { key }, select: { key: true } }))) return err(await unknownKind(reg, key));
  const rows = await reg.prisma.personRelation.findMany({ where: { kind: key } });
  if (rows.length > 0 && moveTo === undefined) {
    return err(new Error(`${rows.length} relationship(s) are ${key}. Pass moveTo with another kind to move them first, or remove them with personRelation.remove.`));
  }

  let moves: { readonly id: string; readonly fromId: string; readonly toId: string }[] = [];
  let drops: string[] = [];
  if (moveTo !== undefined && rows.length > 0) {
    if (moveTo === key) return err(new Error('moveTo must be another kind'));
    const target = await getPersonRelationKind(reg, moveTo);
    if (!target.ok) return err(target.error);
    if (target.value.exclusive) return err(new Error(`${moveTo} is one each, so relationships can't be moved into it in bulk; add them with personRelation.add`));
    const existing = await reg.prisma.personRelation.findMany({ where: { kind: moveTo }, select: { fromPersonId: true, toPersonId: true } });
    const taken = new Set(existing.map((r) => `${r.fromPersonId}>${r.toPersonId}`));
    for (const row of rows) {
      const ends = orderedEnds(target.value, row.fromPersonId, row.toPersonId);
      const pair = `${ends.fromId}>${ends.toId}`;
      if (taken.has(pair)) {
        drops = [...drops, row.id];
      } else {
        taken.add(pair);
        moves = [...moves, { id: row.id, ...ends }];
      }
    }
  }

  await reg.prisma.$transaction([
    ...(drops.length > 0 ? [reg.prisma.personRelation.deleteMany({ where: { id: { in: drops } } })] : []),
    ...moves.map((m) => reg.prisma.personRelation.update({ where: { id: m.id }, data: { kind: moveTo!, fromPersonId: m.fromId, toPersonId: m.toId } })),
    reg.prisma.personRelationKind.delete({ where: { key } })
  ]);
  return ok({ deleted: true as const, relationsMoved: moves.length, relationsDropped: drops.length });
};

/** Adds the kinds a notebook's modules bring and it doesn't have yet. Returns the keys added. */
export const seedPersonRelationKinds = async (reg: Reg, seeds: readonly PersonRelationKindSeed[]): Promise<readonly string[]> => {
  const existing = new Set((await reg.prisma.personRelationKind.findMany({ select: { key: true } })).map((r) => r.key));
  const missing = seeds.filter((s) => !existing.has(s.key));
  for (const [i, seed] of missing.entries()) {
    await reg.prisma.personRelationKind.create({ data: { ...seed, sortOrder: existing.size + i } });
  }
  return missing.map((s) => s.key);
};
