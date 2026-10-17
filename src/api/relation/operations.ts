import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable, ACTIVE, isArchivedRef, loadArchivedIds } from '$api/_archive';
import type { EntityType, RelatableType, RelationKind } from '$shared/types/enums';
import { RELATION_KINDS } from '$shared/types/enums';
import { RELATION_LABELS, relationLabel, type RelationGroup, type RelationItem } from '$shared/types/relations';
import type { PersonRelationKindDefinition } from '$shared/types/person-relations';
import { docPath, entityPath } from '$shared/utils/entity';
import { resolveEntityLabel, resolveEntityLabels } from '$api/_entity-labels';
import { loadPersonRelationKinds } from '$api/person-relation-kind/operations';
import { listPersonRelationItems } from '$api/person-relation/operations';

// ----- Pure helpers -----

/**
 * Groups by label ("Depends on", "Needed by", "Child of", …): relationships between
 * people first, in their kinds' order, then RELATED, DEPENDS_ON and MENTIONS;
 * outgoing before incoming.
 */
export const groupRelations = (items: readonly RelationItem[], personKinds: readonly PersonRelationKindDefinition[]): readonly RelationGroup[] => {
  const sorted = [...personKinds].sort((a, b) => a.sortOrder - b.sortOrder);
  const order = (item: RelationItem): number => {
    if (item.personRelation) {
      const i = sorted.findIndex((k) => k.key === item.kind);
      return i === -1 ? sorted.length : i;
    }
    return sorted.length + 1 + (RELATION_KINDS as readonly string[]).indexOf(item.kind);
  };
  const rank = (item: RelationItem) => order(item) * 2 + (item.direction === 'incoming' ? 1 : 0);
  const groups = new Map<string, { rank: number; items: RelationItem[] }>();
  for (const item of items) {
    const group = groups.get(item.label) ?? { rank: rank(item), items: [] };
    group.items.push(item);
    groups.set(item.label, group);
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => a.rank - b.rank)
    .map(([label, group]) => ({ label, items: group.items }));
};

// ----- Queries -----

type AttachedOwners = ReadonlyMap<string, { readonly entityType: EntityType; readonly entityId: string }>;

// Docs, notes and todos have no page of their own; link to the entity they're
// attached to (a todo opens in its popup there, a doc in its centre pane).
// Looks up what they're attached to for all of them at once.
const loadAttachedOwners = async (
  reg: Pick<Registry, 'prisma'>,
  refs: readonly { readonly type: RelatableType; readonly id: string }[]
): Promise<AttachedOwners> => {
  const idsOf = (type: RelatableType): string[] => [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];
  const select = { id: true, entityType: true, entityId: true } as const;
  const find = <T extends { readonly id: string; readonly entityType: string; readonly entityId: string }>(
    type: RelatableType,
    query: (ids: string[]) => Promise<T[]>
  ): Promise<readonly (readonly [string, { entityType: EntityType; entityId: string }])[]> => {
    const ids = idsOf(type);
    return ids.length === 0
      ? Promise.resolve([])
      : query(ids).then((rows) => rows.map((r) => [`${type}:${r.id}`, { entityType: r.entityType as EntityType, entityId: r.entityId }] as const));
  };
  const found = await Promise.all([
    find('TODO', (ids) => reg.prisma.todo.findMany({ where: { id: { in: ids } }, select })),
    find('DOC', (ids) => reg.prisma.doc.findMany({ where: { id: { in: ids } }, select })),
    find('NOTE', (ids) => reg.prisma.note.findMany({ where: { id: { in: ids } }, select }))
  ]);
  return new Map(found.flat());
};

const pathOf = (owners: AttachedOwners, entityType: RelatableType, entityId: string): string => {
  const owner = owners.get(`${entityType}:${entityId}`);
  if (owner && entityType === 'TODO') return `${entityPath(owner.entityType, owner.entityId)}?popup=todo&todo=${entityId}`;
  if (owner && entityType === 'DOC') return docPath(owner.entityType, owner.entityId, entityId);
  if (owner && entityType === 'NOTE') return entityPath(owner.entityType, owner.entityId);
  return entityPath(entityType, entityId);
};

/**
 * Relations at either end of an entity, grouped by how they read from its side,
 * with a person's relationships to other people. Relations to deleted or archived entities, and
 * to what's attached to an archived one (a doc on an archived project), are left out.
 */
export const listRelationsForEntity = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly RelationGroup[]>> => {
  const [rows, personKinds, personItems, archived] = await Promise.all([
    reg.prisma.relation.findMany({
      where: { OR: [{ fromType: entityType, fromId: entityId }, { toType: entityType, toId: entityId }] },
      orderBy: { createdAt: 'asc' }
    }),
    entityType === 'PERSON' ? loadPersonRelationKinds(reg) : Promise.resolve([]),
    entityType === 'PERSON' ? listPersonRelationItems(reg, entityId) : Promise.resolve([]),
    loadArchivedIds(reg)
  ]);

  // A goal depends on the projects linked to it, so the link shows on both pages.
  const links = entityType === 'GOAL' || entityType === 'PROJECT'
    ? await reg.prisma.goalProject.findMany({
      where: entityType === 'GOAL' ? { goalId: entityId, project: ACTIVE } : { projectId: entityId, goal: ACTIVE },
      orderBy: { createdAt: 'asc' }
    })
    : [];

  const others = rows.map((row) => {
    const outgoing = row.fromType === entityType && row.fromId === entityId;
    return { row, outgoing, type: (outgoing ? row.toType : row.fromType) as RelatableType, id: outgoing ? row.toId : row.fromId };
  });
  const linkOthers = links.map((link) => {
    const outgoing = entityType === 'GOAL';
    return { link, outgoing, type: (outgoing ? 'PROJECT' : 'GOAL') as RelatableType, id: outgoing ? link.projectId : link.goalId };
  });
  const [labels, owners] = await Promise.all([
    resolveEntityLabels(reg, [...others, ...linkOthers].map((o) => ({ entityType: o.type, entityId: o.id }))),
    loadAttachedOwners(reg, others)
  ]);
  const hidden = (type: RelatableType, id: string): boolean => {
    const owner = owners.get(`${type}:${id}`);
    return isArchivedRef(archived, type, id) || (owner !== undefined && isArchivedRef(archived, owner.entityType, owner.entityId));
  };

  const items = others.map(({ row, outgoing, type: otherType, id: otherId }): RelationItem | null => {
    const kind = row.kind as RelationKind;
    const label = labels.labelOf(otherType, otherId);
    if (label === null || hidden(otherType, otherId)) return null;
    return {
      id: row.id,
      kind,
      direction: outgoing ? 'outgoing' : 'incoming',
      label: relationLabel(kind, outgoing),
      other: { entityType: otherType, entityId: otherId, label, path: pathOf(owners, otherType, otherId) },
      note: row.note,
      createdAt: row.createdAt
    };
  });

  const linkItems = linkOthers.map(({ link, outgoing, type: otherType, id: otherId }): RelationItem | null => {
    const label = labels.labelOf(otherType, otherId);
    if (label === null) return null;
    return {
      id: link.id,
      kind: 'DEPENDS_ON',
      direction: outgoing ? 'outgoing' : 'incoming',
      label: relationLabel('DEPENDS_ON', outgoing),
      other: { entityType: otherType, entityId: otherId, label, path: entityPath(otherType, otherId) },
      note: null,
      createdAt: link.createdAt,
      goalProject: true
    };
  });

  return ok(groupRelations([...personItems, ...items, ...linkItems].filter((item): item is RelationItem => item !== null), personKinds));
};

// ----- Mutations -----

interface RelationEnds {
  readonly fromType: string;
  readonly fromId: string;
  readonly toType: string;
  readonly toId: string;
}

/** A relation of `kind` between the same two entities. A kind with no direction also matches the reverse. */
const findDuplicate = async (
  reg: Pick<Registry, 'prisma'>,
  ends: RelationEnds,
  kind: RelationKind
): Promise<{ readonly id: string } | null> => {
  const find = (fromType: string, fromId: string, toType: string, toId: string) =>
    reg.prisma.relation.findUnique({
      where: { fromType_fromId_toType_toId_kind: { fromType, fromId, toType, toId, kind } },
      select: { id: true }
    });
  return (await find(ends.fromType, ends.fromId, ends.toType, ends.toId))
    ?? (RELATION_LABELS[kind].symmetric ? await find(ends.toType, ends.toId, ends.fromType, ends.fromId) : null);
};

export interface AddRelationInput {
  readonly fromType: RelatableType;
  readonly fromId: string;
  readonly toType: RelatableType;
  readonly toId: string;
  readonly kind: RelationKind;
  readonly note?: string | null;
}

const MENTIONS_ERROR = 'MENTIONS relations come from links in content: link to the entity with its path in the markdown instead';

export const addRelation = async (
  reg: Pick<Registry, 'prisma'>,
  input: AddRelationInput
): Promise<Result<{ readonly id: string }>> => {
  if (input.fromType === input.toType && input.fromId === input.toId) {
    return err(new Error('A relation needs two different entities'));
  }
  if (input.kind === 'MENTIONS') return err(new Error(MENTIONS_ERROR));

  // Relations *to* an archived entity are allowed ("supersedes" an archived project); from one, not.
  const writable = await ensureWritable(reg, input.fromType, input.fromId);
  if (!writable.ok) return err(writable.error);

  const [fromLabel, toLabel] = await Promise.all([
    resolveEntityLabel(reg, input.fromType, input.fromId),
    resolveEntityLabel(reg, input.toType, input.toId)
  ]);
  if (fromLabel === null) return err(new Error(`${input.fromType} ${input.fromId} not found`));
  if (toLabel === null) return err(new Error(`${input.toType} ${input.toId} not found`));

  const key = { fromType: input.fromType, fromId: input.fromId, toType: input.toType, toId: input.toId, kind: input.kind };
  const existing = await findDuplicate(reg, input, input.kind);
  if (existing) {
    return err(new Error(
      `"${fromLabel}" ${RELATION_LABELS[input.kind].label.toLowerCase()} "${toLabel}" already (relation ${existing.id}); use relation.update to change its note`
    ));
  }

  const row = await reg.prisma.relation.create({ data: { ...key, note: input.note ?? null } });
  return ok({ id: row.id });
};

export const updateRelation = async (
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: { readonly kind?: RelationKind; readonly note?: string | null }
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.relation.findUnique({ where: { id } });
  if (!existing) return err(new Error(`Relation ${id} not found`));
  const writable = await ensureWritable(reg, existing.fromType, existing.fromId);
  if (!writable.ok) return err(writable.error);
  if (existing.kind === 'MENTIONS' || input.kind === 'MENTIONS') {
    return err(new Error('MENTIONS relations come from links in content and can\'t be edited; change the content instead'));
  }

  if (input.kind !== undefined && input.kind !== existing.kind) {
    const clash = await findDuplicate(reg, existing, input.kind);
    if (clash) return err(new Error(`A ${input.kind} relation between these entities already exists (relation ${clash.id})`));
  }

  await reg.prisma.relation.update({
    where: { id },
    data: {
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.note !== undefined && { note: input.note })
    }
  });
  return ok({ id });
};

export const removeRelation = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.relation.findUnique({ where: { id } });
  if (!existing) return err(new Error(`Relation ${id} not found`));
  const writable = await ensureWritable(reg, existing.fromType, existing.fromId);
  if (!writable.ok) return err(writable.error);
  if (existing.kind === 'MENTIONS') {
    return err(new Error('MENTIONS relations come from links in content; remove the link from the content instead'));
  }

  await reg.prisma.relation.delete({ where: { id } });
  return ok({ deleted: true as const });
};
