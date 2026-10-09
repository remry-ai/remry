// Relationships between two people. The database keeps them sound: both people
// must exist (deleting one deletes their relationships), a person can't relate
// to themselves, a symmetric kind has one row per pair (smaller id first), and a
// person is the `to` end of one relationship of a one-each kind at most, so
// adding another replaces it and says which one it replaced.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { entityPath } from '$shared/utils/entity';
import {
  orderedEnds,
  personRelationLabel,
  type PersonRelationKindDefinition,
  type PersonRelationResult
} from '$shared/types/person-relations';
import type { RelationItem } from '$shared/types/relations';
import { getPersonRelationKind, loadPersonRelationKinds } from '$api/person-relation-kind/operations';

type Reg = Pick<Registry, 'prisma'>;

// ----- Queries -----

/** A person's relationships, as relation items read from their side. */
export const listPersonRelationItems = async (reg: Reg, personId: string): Promise<readonly RelationItem[]> => {
  const [rows, kinds] = await Promise.all([
    reg.prisma.personRelation.findMany({
      where: { OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
      include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    loadPersonRelationKinds(reg)
  ]);
  return rows.map((row) => {
    const outgoing = row.fromPersonId === personId;
    const other = outgoing ? row.to : row.from;
    return {
      id: row.id,
      kind: row.kind,
      direction: outgoing ? 'outgoing' : 'incoming',
      label: personRelationLabel(kinds, row.kind, outgoing),
      other: { entityType: 'PERSON', entityId: other.id, label: other.name, path: entityPath('PERSON', other.id) },
      note: row.note,
      createdAt: row.createdAt,
      personRelation: true
    };
  });
};

/** Each person's relationships with `meId`, as labels from their side ("Child of"). */
export const relationsToPerson = async (reg: Reg, meId: string | null): Promise<ReadonlyMap<string, readonly string[]>> => {
  if (!meId) return new Map();
  const [rows, kinds] = await Promise.all([
    reg.prisma.personRelation.findMany({ where: { OR: [{ fromPersonId: meId }, { toPersonId: meId }] }, orderBy: { createdAt: 'asc' } }),
    loadPersonRelationKinds(reg)
  ]);
  const out = new Map<string, string[]>();
  for (const r of rows) {
    // The other person's side: they're the `from` end when the relationship points at me.
    const [other, fromTheirSide] = r.toPersonId === meId ? [r.fromPersonId, true] : [r.toPersonId, false];
    out.set(other, [...(out.get(other) ?? []), personRelationLabel(kinds, r.kind, fromTheirSide)]);
  }
  return out;
};

// ----- Mutations -----

export interface AddPersonRelationInput {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: string;
  readonly note?: string | null;
}

const nameOf = async (reg: Reg, id: string): Promise<string | null> =>
  (await reg.prisma.person.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;

/** The relationship a one-each kind would replace at the `to` person, other than `exceptId`. */
const toReplace = async (reg: Reg, kind: PersonRelationKindDefinition, toId: string, exceptId?: string) => {
  if (!kind.exclusive) return null;
  const row = await reg.prisma.personRelation.findFirst({
    where: { kind: kind.key, toPersonId: toId, ...(exceptId && { id: { not: exceptId } }) },
    include: { from: { select: { id: true, name: true } } }
  });
  return row ? { id: row.id, personId: row.from.id, name: row.from.name } : null;
};

/**
 * A one-each kind forms a tree (each person has one lead), so it can't loop:
 * walking up from `fromId` must never reach `toId`. Other kinds can (two parents).
 */
const wouldLoop = async (reg: Reg, kind: string, fromId: string, toId: string): Promise<boolean> => {
  const seen = new Set<string>();
  let current: string | null = fromId;
  while (current !== null && !seen.has(current)) {
    if (current === toId) return true;
    seen.add(current);
    const up: { fromPersonId: string } | null = await reg.prisma.personRelation.findFirst({
      where: { kind, toPersonId: current },
      select: { fromPersonId: true }
    });
    current = up?.fromPersonId ?? null;
  }
  return false;
};

const loopError = (kind: PersonRelationKindDefinition): Error =>
  new Error(`That would make a loop: ${kind.key} is one each, so its relationships form a tree (someone can't be ${kind.label.toLowerCase()} a person above them)`);

const duplicate = (reg: Reg, kind: string, fromId: string, toId: string) =>
  reg.prisma.personRelation.findUnique({
    where: { fromPersonId_toPersonId_kind: { fromPersonId: fromId, toPersonId: toId, kind } },
    select: { id: true }
  });

export const addPersonRelation = async (reg: Reg, input: AddPersonRelationInput): Promise<Result<PersonRelationResult>> => {
  if (input.fromId === input.toId) return err(new Error('A relationship needs two different people'));
  const kind = await getPersonRelationKind(reg, input.kind);
  if (!kind.ok) return err(kind.error);

  const [fromName, toName] = await Promise.all([nameOf(reg, input.fromId), nameOf(reg, input.toId)]);
  if (fromName === null) return err(new Error(`PERSON ${input.fromId} not found`));
  if (toName === null) return err(new Error(`PERSON ${input.toId} not found`));
  // To an archived person is fine (a former lead); from one, not.
  const writable = await ensureWritable(reg, 'PERSON', input.fromId);
  if (!writable.ok) return err(writable.error);

  const ends = orderedEnds(kind.value, input.fromId, input.toId);
  const existing = await duplicate(reg, kind.value.key, ends.fromId, ends.toId);
  if (existing) {
    return err(new Error(
      `${fromName} is already ${kind.value.label.toLowerCase()} ${toName} (person relation ${existing.id}); use personRelation.update to change its note`
    ));
  }

  if (kind.value.exclusive && (await wouldLoop(reg, kind.value.key, ends.fromId, ends.toId))) return err(loopError(kind.value));
  const replaced = await toReplace(reg, kind.value, ends.toId);
  const create = reg.prisma.personRelation.create({
    data: { fromPersonId: ends.fromId, toPersonId: ends.toId, kind: kind.value.key, note: input.note ?? null }
  });
  const row = replaced
    ? (await reg.prisma.$transaction([reg.prisma.personRelation.delete({ where: { id: replaced.id } }), create]))[1]
    : await create;
  return ok({ id: row.id, replaced });
};

export const updatePersonRelation = async (
  reg: Reg,
  id: string,
  input: { readonly kind?: string; readonly note?: string | null }
): Promise<Result<PersonRelationResult>> => {
  const existing = await reg.prisma.personRelation.findUnique({ where: { id } });
  if (!existing) return err(new Error(`Person relation ${id} not found`));
  const writable = await ensureWritable(reg, 'PERSON', existing.fromPersonId);
  if (!writable.ok) return err(writable.error);

  if (input.kind === undefined || input.kind === existing.kind) {
    await reg.prisma.personRelation.update({ where: { id }, data: { ...(input.note !== undefined && { note: input.note }) } });
    return ok({ id, replaced: null });
  }

  const kind = await getPersonRelationKind(reg, input.kind);
  if (!kind.ok) return err(kind.error);
  const ends = orderedEnds(kind.value, existing.fromPersonId, existing.toPersonId);
  const clash = await duplicate(reg, kind.value.key, ends.fromId, ends.toId);
  if (clash) return err(new Error(`These two people already have a ${kind.value.key} relationship (person relation ${clash.id})`));

  if (kind.value.exclusive && (await wouldLoop(reg, kind.value.key, ends.fromId, ends.toId))) return err(loopError(kind.value));
  const replaced = await toReplace(reg, kind.value, ends.toId, id);
  await reg.prisma.$transaction([
    ...(replaced ? [reg.prisma.personRelation.delete({ where: { id: replaced.id } })] : []),
    reg.prisma.personRelation.update({
      where: { id },
      data: {
        kind: kind.value.key,
        fromPersonId: ends.fromId,
        toPersonId: ends.toId,
        ...(input.note !== undefined && { note: input.note })
      }
    })
  ]);
  return ok({ id, replaced });
};

export const removePersonRelation = async (reg: Reg, id: string): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.personRelation.findUnique({ where: { id } });
  if (!existing) return err(new Error(`Person relation ${id} not found`));
  const writable = await ensureWritable(reg, 'PERSON', existing.fromPersonId);
  if (!writable.ok) return err(writable.error);
  await reg.prisma.personRelation.delete({ where: { id } });
  return ok({ deleted: true as const });
};

// ----- Used by modules -----

/** The `to` person's single relationship of a one-each kind, replaced (or cleared with null) in one go. */
export const setExclusiveRelation = async (
  reg: Reg,
  kind: string,
  toId: string,
  fromId: string | null
): Promise<Result<void>> => {
  if (fromId === toId) return err(new Error('A person can\'t be related to themselves'));
  if (fromId !== null && (await nameOf(reg, fromId)) === null) return err(new Error(`PERSON ${fromId} not found`));
  if (fromId !== null && (await wouldLoop(reg, kind, fromId, toId))) {
    return err(new Error('That would make a loop: someone can\'t be led by a person they lead, directly or further down'));
  }
  await reg.prisma.$transaction([
    reg.prisma.personRelation.deleteMany({ where: { kind, toPersonId: toId } }),
    ...(fromId !== null ? [reg.prisma.personRelation.create({ data: { fromPersonId: fromId, toPersonId: toId, kind } })] : [])
  ]);
  return ok(undefined);
};
