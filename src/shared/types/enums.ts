// String unions for columns SQLite stores as plain text (it has no enums).
// Zod schemas use these arrays via z.enum(); TypeScript uses the derived types.

export const ENTITY_TYPES = [
  'PERSON',
  'GROUP',
  'PROJECT',
  'GOAL',
  'PAGE',
  'DOC',
  'NOTE',
  'REPORT',
  'TODO',
  'LINK',
  'TAG',
  'COMMENT',
  'EMOJI'
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const TODO_STATUSES = ['PENDING', 'ACTIVE', 'COMPLETE', 'CANCELLED'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

/** How often a todo comes back: completing one creates the next. */
export const TODO_RECURRENCES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

export type TodoRecurrence = (typeof TODO_RECURRENCES)[number];

/** Who can own a goal or a project. */
export const OWNER_TYPES = ['PERSON', 'GROUP'] as const;

export type OwnerType = (typeof OWNER_TYPES)[number];

export const GOAL_STATUSES = ['NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'DONE', 'DROPPED'] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * Relation kinds: RELATED has no direction, DEPENDS_ON does, and MENTIONS is derived
 * from app links in content and never written by hand. Relationships between people
 * (Parent of / Child of, Lead of…) are person relations, of kinds the notebook defines.
 */
export const MANUAL_RELATION_KINDS = ['RELATED', 'DEPENDS_ON'] as const;

export type ManualRelationKind = (typeof MANUAL_RELATION_KINDS)[number];

export const RELATION_KINDS = [...MANUAL_RELATION_KINDS, 'MENTIONS'] as const;

export type RelationKind = (typeof RELATION_KINDS)[number];

/** Entity types that can be archived: hidden from lists and read-only until unarchived. */
export const ARCHIVABLE_TYPES = ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE'] as const;

export type ArchivableType = (typeof ARCHIVABLE_TYPES)[number];

/** Which rows a list returns: active only (the default), archived only, or both. */
export const ARCHIVE_FILTERS = ['exclude', 'only', 'include'] as const;

export type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

/** Entity types a relation can start or end at. */
export const RELATABLE_TYPES = ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE', 'DOC', 'NOTE', 'REPORT', 'TODO'] as const;

export type RelatableType = (typeof RELATABLE_TYPES)[number];
