// Relations: links between any two entities, with a kind and an optional note.
// The kinds are fixed: RELATED (no direction), DEPENDS_ON, and MENTIONS, derived
// from app links in content. Relationships between people (Parent of, Lead of)
// are person relations (`./person-relations`); relation.forEntity shows both.

import type { RelatableType, RelationKind } from './enums';

interface BuiltInKind {
  readonly label: string;
  readonly inverseLabel: string;
  readonly symmetric: boolean;
}

export const RELATION_LABELS: Readonly<Record<RelationKind, BuiltInKind>> = {
  RELATED: { label: 'Related to', inverseLabel: 'Related to', symmetric: true },
  DEPENDS_ON: { label: 'Depends on', inverseLabel: 'Needed by', symmetric: false },
  MENTIONS: { label: 'Mentions', inverseLabel: 'Mentioned in', symmetric: false }
};

export const relationLabel = (kind: RelationKind, outgoing: boolean): string =>
  outgoing ? RELATION_LABELS[kind].label : RELATION_LABELS[kind].inverseLabel;

export interface RelationItem {
  readonly id: string;
  /** A relation kind, or a person relation kind's key when `personRelation` is set. */
  readonly kind: string;
  readonly direction: 'outgoing' | 'incoming';
  /** The label from this entity's side, e.g. "Used by". */
  readonly label: string;
  readonly other: {
    readonly entityType: RelatableType;
    readonly entityId: string;
    readonly label: string | null;
    readonly path: string;
  };
  readonly note: string | null;
  readonly createdAt: Date;
  /** Set for a goal–project link shown as a relation; it's managed in the goal's Projects section, not with relation.remove. */
  readonly goalProject?: true;
  /** Set for a relationship between two people: change it with personRelation.*, not relation.*. */
  readonly personRelation?: true;
}

export interface RelationGroup {
  readonly label: string;
  readonly items: readonly RelationItem[];
}
