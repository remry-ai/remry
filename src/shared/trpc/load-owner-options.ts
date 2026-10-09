// Owner choices (groups, by kind, then people) for goal and project owner
// pickers. Each option's id is `TYPE:id`, so one <select> can hold both types.

import type { CreateTRPCClient } from '@trpc/client';
import type { AppRouter } from './router';
import { OWNER_TYPES, type OwnerType } from '$shared/types/enums';
import { parseTypedIdValue, typedIdValue } from '$shared/utils/entity';

export interface OwnerOption {
  readonly id: string;
  readonly name: string;
  readonly group: string;
}

export const ownerOptionValue = (ownerType: OwnerType, ownerId: string): string => typedIdValue(ownerType, ownerId);

export const parseOwnerOptionValue = (
  value: string
): { readonly ownerType: OwnerType; readonly ownerId: string } | null => {
  const parsed = parseTypedIdValue(value, OWNER_TYPES);
  return parsed ? { ownerType: parsed.type, ownerId: parsed.id } : null;
};

export const loadOwnerOptions = async (client: CreateTRPCClient<AppRouter>): Promise<readonly OwnerOption[]> => {
  const [groups, kinds, people] = await Promise.all([
    client.group.list.query(),
    client.groupKind.list.query(),
    client.person.list.query()
  ]);
  const plural = new Map((kinds.ok ? kinds.value : []).map((k) => [k.key, k.plural]));
  return [
    ...(groups.ok ? groups.value : []).map((g) => ({ id: ownerOptionValue('GROUP', g.id), name: g.name, group: plural.get(g.kind) ?? 'Groups' })),
    ...(people.ok ? people.value : []).map((p) => ({ id: ownerOptionValue('PERSON', p.id), name: p.name, group: 'People' }))
  ];
};
