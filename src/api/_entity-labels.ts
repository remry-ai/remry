// Cross-domain helper (not a domain): resolves a polymorphic entity reference
// (entityType + entityId) to the entity's display name. Null means the entity
// doesn't exist (or its type has no name). For a list, use resolveEntityLabels:
// one query per type, however many rows.

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';
import { LABEL_BATCH_PORTS, LABEL_PORTS } from '$api/entities/ports';

export const resolveEntityLabel = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<string | null> => {
  const label = LABEL_PORTS[entityType];
  return label ? label(reg, entityId) : null;
};

export interface EntityRef {
  readonly entityType: EntityType;
  readonly entityId: string;
}

/** Names looked up by resolveEntityLabels. */
export interface EntityLabels {
  /** The entity's display name, or null if it doesn't exist (or wasn't asked for). */
  readonly labelOf: (entityType: EntityType, entityId: string) => string | null;
}

const refKey = (entityType: string, entityId: string): string => `${entityType}:${entityId}`;

/** Display names for many references at once: one query per entity type among them. */
export const resolveEntityLabels = async (
  reg: Pick<Registry, 'prisma'>,
  refs: readonly EntityRef[]
): Promise<EntityLabels> => {
  const idsByType = new Map<EntityType, Set<string>>();
  for (const { entityType, entityId } of refs) {
    const ids = idsByType.get(entityType) ?? new Set<string>();
    ids.add(entityId);
    idsByType.set(entityType, ids);
  }
  const found = await Promise.all(
    [...idsByType].map(async ([entityType, ids]) => {
      const batch = LABEL_BATCH_PORTS[entityType];
      return [entityType, batch ? await batch(reg, [...ids]) : new Map<string, string>()] as const;
    })
  );
  const names = new Map<string, string>();
  for (const [entityType, map] of found) for (const [id, name] of map) names.set(refKey(entityType, id), name);
  return { labelOf: (entityType, entityId) => names.get(refKey(entityType, entityId)) ?? null };
};
