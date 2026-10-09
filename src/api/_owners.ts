// Cross-domain helper (not a domain): validates and resolves the owner of a
// goal or project. Owners are polymorphic (ownerType + ownerId), like attached items.

import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import type { OwnerType } from '$shared/types/enums';
import type { EntityOwner } from '$shared/types/owner';
import { entityPath } from '$shared/utils/entity';
import { resolveEntityLabel } from './_entity-labels';

export interface OwnerInput {
  readonly ownerType?: OwnerType | null;
  readonly ownerId?: string | null;
}

export interface OwnerColumns {
  readonly ownerType: OwnerType | null;
  readonly ownerId: string | null;
}

/**
 * The owner columns to write. `undefined` leaves the owner unchanged, nulls
 * clear it, and a type + id must name an existing entity.
 */
export const resolveOwnerInput = async (
  reg: Pick<Registry, 'prisma'>,
  input: OwnerInput
): Promise<Result<OwnerColumns | undefined>> => {
  const { ownerType, ownerId } = input;
  if (ownerType === undefined && ownerId === undefined) return ok(undefined);
  if (!ownerType && !ownerId) return ok({ ownerType: null, ownerId: null });
  if (!ownerType || !ownerId) {
    return err(new Error('Set ownerType and ownerId together, or set both to null to clear the owner'));
  }
  const label = await resolveEntityLabel(reg, ownerType, ownerId);
  if (label === null) return err(new Error(`${ownerType} ${ownerId} not found`));
  return ok({ ownerType, ownerId });
};

export const loadOwner = async (
  reg: Pick<Registry, 'prisma'>,
  ownerType: string | null,
  ownerId: string | null
): Promise<EntityOwner | null> => {
  if (!ownerType || !ownerId) return null;
  const type = ownerType as OwnerType;
  return { type, id: ownerId, label: await resolveEntityLabel(reg, type, ownerId), path: entityPath(type, ownerId) };
};
