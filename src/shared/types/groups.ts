// Groups: any set of people, of a kind each notebook defines (Team, Department,
// Family, Friends). A kind can be exclusive: a person is in at most one group of
// that kind (a department). Shared by the server and the client.

export interface GroupKindDefinition {
  readonly key: string;
  readonly name: string;
  readonly plural: string;
  readonly exclusive: boolean;
  readonly sortOrder: number;
}

export interface GroupKindSummary extends GroupKindDefinition {
  readonly groupCount: number;
}

/** Kind keys look like TEAM or BOOK_CLUB. */
export const GROUP_KIND_KEY = /^[A-Z][A-Z0-9_]{0,39}$/;

export const GROUP_KIND_KEY_RULE = 'capital letters, digits and underscores, starting with a letter (like TEAM or BOOK_CLUB), at most 40';

export interface GroupSummary {
  readonly id: string;
  readonly kind: string;
  readonly kindName: string;
  readonly name: string;
  readonly description: string | null;
  readonly memberCount: number;
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
}

export interface GroupMemberEntry {
  readonly id: string;
  readonly personId: string;
  readonly personName: string;
}

export interface GroupDetail extends GroupSummary {
  readonly exclusive: boolean;
  readonly updatedAt: Date;
  readonly members: readonly GroupMemberEntry[];
}

export interface GroupWithMembers extends GroupSummary {
  readonly members: readonly GroupMemberEntry[];
}

/** A person's membership, with the group's kind. */
export interface PersonGroup {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly kindName: string;
  readonly path: string;
}
