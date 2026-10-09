// Cross-domain helper (not a domain): archiving. An archived person, group,
// project, goal or page keeps its history but leaves lists and the
// home page, and it and everything attached to it are read-only until it's
// unarchived. Deletes stay allowed.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ARCHIVABLE_TYPES, type ArchivableType, type ArchiveFilter } from '$shared/types/enums';
import { ENTITY_DESCRIPTORS } from '$shared/entities/descriptors';
import { ARCHIVABLE_PORTS } from '$api/entities/ports';

const procedurePrefix = (type: ArchivableType): string => type.toLowerCase();
const typeName = (type: ArchivableType): string => ENTITY_DESCRIPTORS[type].singular;

export const isArchivableType = (entityType: string): entityType is ArchivableType =>
  (ARCHIVABLE_TYPES as readonly string[]).includes(entityType);

/** The `where` fragment for a list's archive filter. */
export const archiveWhere = (
  filter: ArchiveFilter = 'exclude'
): { readonly archivedAt?: null | { readonly not: null } } => {
  if (filter === 'include') return {};
  return filter === 'only' ? { archivedAt: { not: null } } : { archivedAt: null };
};

const loadState = (reg: Pick<Registry, 'prisma'>, entityType: ArchivableType, id: string) =>
  ARCHIVABLE_PORTS[entityType].state(reg, id);

/**
 * Refuses a write to an archived entity, or to something attached to one.
 * Types that can't be archived, and entities that don't exist, pass: the
 * operation's own checks report those.
 */
export const ensureWritable = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: string,
  entityId: string
): Promise<Result<void>> => {
  if (!isArchivableType(entityType)) return ok(undefined);
  const state = await loadState(reg, entityType, entityId);
  if (!state?.archivedAt) return ok(undefined);
  return err(new Error(
    `${typeName(entityType)} "${state.name}" is archived, so it and what's attached to it are read-only. ` +
    `Unarchive it first with ${procedurePrefix(entityType)}.unarchive --id ${entityId}`
  ));
};

/** Checks several entities; the first archived one is the error. */
export const ensureAllWritable = async (
  reg: Pick<Registry, 'prisma'>,
  refs: readonly (readonly [entityType: string, entityId: string])[]
): Promise<Result<void>> => {
  for (const [entityType, entityId] of refs) {
    const writable = await ensureWritable(reg, entityType, entityId);
    if (!writable.ok) return writable;
  }
  return ok(undefined);
};

export interface ArchiveResult {
  readonly id: string;
  readonly archivedAt: Date | null;
}

/** Archives or unarchives. Archiving twice keeps the first date. */
export const setArchived = async (
  reg: Pick<Registry, 'prisma' | 'now'>,
  entityType: ArchivableType,
  id: string,
  archived: boolean
): Promise<Result<ArchiveResult>> => {
  const state = await loadState(reg, entityType, id);
  if (!state) return err(new Error(`${typeName(entityType)} ${id} not found`));
  if (archived === (state.archivedAt !== null)) return ok({ id, archivedAt: state.archivedAt });

  const archivedAt = archived ? reg.now() : null;
  await ARCHIVABLE_PORTS[entityType].setArchivedAt(reg, id, archivedAt);
  return ok({ id, archivedAt });
};

export type ArchivedIds = ReadonlyMap<ArchivableType, readonly string[]>;

/** Ids of every archived entity, by type. For hiding what's attached to them. */
export const loadArchivedIds = async (reg: Pick<Registry, 'prisma'>): Promise<ArchivedIds> => {
  const rows = await Promise.all(ARCHIVABLE_TYPES.map((type) => ARCHIVABLE_PORTS[type].archivedIds(reg)));
  return new Map(ARCHIVABLE_TYPES.map((type, i) => [type, rows[i]!]));
};

interface AttachedToArchivedWhere {
  // Mutable arrays: Prisma's where-input types don't accept readonly ones.
  readonly NOT?: { OR: { entityType: string; entityId: { in: string[] } }[] };
}

/** The `where` fragment that leaves out rows attached (entityType + entityId) to an archived entity. */
export const notAttachedToArchived = (ids: ArchivedIds): AttachedToArchivedWhere => {
  const or = [...ids.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([entityType, list]) => ({ entityType, entityId: { in: [...list] } }));
  return or.length > 0 ? { NOT: { OR: or } } : {};
};
