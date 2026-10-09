// Cross-domain helper (not a domain): resolves a polymorphic entity reference
// (entityType + entityId) to the entity's display name. Null means the entity
// doesn't exist (or its type has no name).

import type { Registry } from '$shared/registry';
import type { EntityType } from '$shared/types/enums';
import { LABEL_PORTS } from '$api/entities/ports';

export const resolveEntityLabel = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<string | null> => {
  const label = LABEL_PORTS[entityType];
  return label ? label(reg, entityId) : null;
};
