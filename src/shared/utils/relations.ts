// Adding a link from an entity's own page: the kind is chosen as it reads from
// that side ("Depends on" or "Needed by"), so an inverse choice swaps the ends.
// On a person's page the choices also include the notebook's person relation
// kinds (`person:KIND:out`), which link to people only and go to personRelation.add.

import { MANUAL_RELATION_KINDS, RELATABLE_TYPES, type ManualRelationKind, type RelatableType } from '$shared/types/enums';
import { RELATION_LABELS } from '$shared/types/relations';
import { PERSON_RELATION_KIND_KEY, type PersonRelationKindDefinition } from '$shared/types/person-relations';

export interface RelationEnd {
  readonly entityType: RelatableType;
  readonly entityId: string;
}

export interface RelationChoice {
  readonly id: string;
  readonly name: string;
}

/** A link picked in a form before the entity it starts from is saved: added once it is. */
export interface PickedLink {
  readonly choice: string;
  readonly choiceName: string;
  readonly target: RelationEnd;
  readonly name: string;
}

export interface RelationAddInput {
  readonly fromType: RelatableType;
  readonly fromId: string;
  readonly toType: RelatableType;
  readonly toId: string;
  readonly kind: ManualRelationKind;
}

export interface PersonRelationAddInput {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: string;
}

const PERSON_PREFIX = 'person:';

/** The entity as one end of a relation, or null for a type relations can't point at. */
export const relationEnd = (entityType: string, entityId: string): RelationEnd | null =>
  (RELATABLE_TYPES as readonly string[]).includes(entityType) && entityId
    ? { entityType: entityType as RelatableType, entityId }
    : null;

const both = (id: string, label: string, inverseLabel: string, symmetric: boolean): readonly RelationChoice[] =>
  symmetric ? [{ id: `${id}:out`, name: label }] : [{ id: `${id}:out`, name: label }, { id: `${id}:in`, name: inverseLabel }];

/**
 * Kind options from this entity's side: a kind with no direction once, other kinds
 * forward (`KIND:out`) and inverse (`KIND:in`). A person also gets the notebook's
 * person relation kinds (`personKinds`, personRelationKind.list).
 */
export const relationChoices = (
  personKinds: readonly PersonRelationKindDefinition[],
  selfType: string | null
): readonly RelationChoice[] => [
  ...MANUAL_RELATION_KINDS.flatMap((k) => both(k, RELATION_LABELS[k].label, RELATION_LABELS[k].inverseLabel, RELATION_LABELS[k].symmetric)),
  ...(selfType === 'PERSON' ? personKinds.flatMap((k) => both(`${PERSON_PREFIX}${k.key}`, k.label, k.inverseLabel, k.symmetric)) : [])
];

/** Whether a choice is a person relation kind, so the target must be a person. */
export const isPersonChoice = (choice: string): boolean => choice.startsWith(PERSON_PREFIX);

/** The `relation.add` input for a choice between this entity and a target, or null for a choice it can't read. */
export const toRelationInput = (choice: string, self: RelationEnd, target: RelationEnd): RelationAddInput | null => {
  const [kind = '', direction] = choice.split(':');
  if (!(MANUAL_RELATION_KINDS as readonly string[]).includes(kind)) return null;
  const known = direction === 'out' || (direction === 'in' && !RELATION_LABELS[kind as ManualRelationKind].symmetric);
  if (!known) return null;
  const [from, to] = direction === 'out' ? [self, target] : [target, self];
  return { fromType: from.entityType, fromId: from.entityId, toType: to.entityType, toId: to.entityId, kind: kind as ManualRelationKind };
};

/** The `personRelation.add` input for a person choice between two people, or null for one it can't read. */
export const toPersonRelationInput = (
  choice: string,
  selfId: string,
  targetId: string,
  kinds: readonly PersonRelationKindDefinition[]
): PersonRelationAddInput | null => {
  if (!isPersonChoice(choice)) return null;
  const [kind = '', direction] = choice.slice(PERSON_PREFIX.length).split(':');
  if (!PERSON_RELATION_KIND_KEY.test(kind)) return null;
  const symmetric = kinds.find((k) => k.key === kind)?.symmetric ?? false;
  if (direction !== 'out' && !(direction === 'in' && !symmetric)) return null;
  return direction === 'out' ? { fromId: selfId, toId: targetId, kind } : { fromId: targetId, toId: selfId, kind };
};
