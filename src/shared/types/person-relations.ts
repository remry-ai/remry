// Relationships between two people, of kinds each notebook defines (person_relation_kind):
// a label each way ("Parent of" / "Child of"), whether it has a direction, and
// whether a person can have one at most ("Reports to": one lead). Modules seed
// their kinds; the user can add more.

export interface PersonRelationKindDefinition {
  readonly key: string;
  /** How it reads from the `from` person: "Parent of". */
  readonly label: string;
  /** How it reads from the `to` person: "Child of"; the same as `label` when symmetric. */
  readonly inverseLabel: string;
  /** No direction: A→B is the same relationship as B→A. */
  readonly symmetric: boolean;
  /** The `to` person has one at most (one lead): adding another replaces it. */
  readonly exclusive: boolean;
  readonly sortOrder: number;
}

export interface PersonRelationKindSummary extends PersonRelationKindDefinition {
  readonly relationCount: number;
}

/** Kind keys look like PARENT_OF or MENTOR_OF. */
export const PERSON_RELATION_KIND_KEY = /^[A-Z][A-Z0-9_]{0,39}$/;

/** The kind's label from one end; an unknown kind reads as its key. */
export const personRelationLabel = (kinds: readonly PersonRelationKindDefinition[], kind: string, outgoing: boolean): string => {
  const def = kinds.find((k) => k.key === kind);
  if (!def) return kind;
  return outgoing ? def.label : def.inverseLabel;
};

/** A symmetric kind is stored with the smaller person id first, so a pair has one row. */
export const orderedEnds = (
  kind: Pick<PersonRelationKindDefinition, 'symmetric'>,
  fromId: string,
  toId: string
): { readonly fromId: string; readonly toId: string } =>
  kind.symmetric && fromId > toId ? { fromId: toId, toId: fromId } : { fromId, toId };

export interface PersonRelationResult {
  readonly id: string;
  /** The relationship a one-each kind replaced (the person's previous lead), if any. */
  readonly replaced: { readonly id: string; readonly personId: string; readonly name: string } | null;
}
