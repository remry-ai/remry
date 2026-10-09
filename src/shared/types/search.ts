// Full-text search and recall. The index (`search_index`, an FTS5 table) is
// kept in sync by triggers; see src/api/CLAUDE.md § Search.

import type { EntityType, RelatableType } from './enums';
import type { RelationGroup } from './relations';

/** What the index holds rows for. GOAL_CHECKIN is a goal check-in's comment; it opens on its goal. */
export const SEARCH_TYPES = [
  'PERSON',
  'GROUP',
  'PROJECT',
  'GOAL',
  'PAGE',
  'DOC',
  'REPORT',
  'NOTE',
  'COMMENT',
  'TODO',
  'LINK',
  'GOAL_CHECKIN'
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchHit {
  readonly entityType: SearchType;
  readonly entityId: string;
  /** The title, or the first line of a note or comment. */
  readonly name: string;
  /** App route that shows it: an attachment opens on the entity it's attached to. */
  readonly path: string;
  /** The entity an attachment (note, doc, todo, comment, link, check-in) hangs off. Null for top-level entities. */
  readonly on: { readonly entityType: EntityType; readonly entityId: string; readonly name: string } | null;
  /** Matching text, with matches in **bold**. */
  readonly snippet: string;
  /** bm25 relevance: lower is better. */
  readonly score: number;
}

export interface SearchResults {
  readonly query: string;
  readonly results: readonly SearchHit[];
}

/** A capped list: `truncated` when there were more than the limit. */
export interface RecallList<T> {
  readonly items: readonly T[];
  readonly truncated: boolean;
}

export interface RecallNote {
  readonly id: string;
  readonly content: string;
  readonly parentId: string | null;
  readonly createdAt: Date;
}

export interface RecallComment {
  readonly id: string;
  readonly content: string;
  readonly createdAt: Date;
}

export interface RecallTodo {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly priority: number;
  readonly targetDate: Date | null;
}

export interface RecallDoc {
  readonly id: string;
  readonly title: string;
  /** The start of the content; `doc.get` returns all of it. */
  readonly excerpt: string;
  readonly updatedAt: Date;
}

export interface RecallLink {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
}

export interface RecallGoal {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly period: string | null;
  readonly target: number | null;
  readonly unit: string | null;
  readonly latestCheckIn: { readonly date: Date; readonly value: number | null; readonly status: string | null; readonly comment: string | null } | null;
}

export interface RecallProject {
  readonly id: string;
  readonly name: string;
  readonly status: string | null;
}

export interface Recall<TEntity = unknown> {
  readonly entityType: RelatableType;
  readonly entityId: string;
  readonly name: string;
  readonly path: string;
  readonly archived: boolean;
  /** What the type's own `get` returns (`person.get`, `project.get`, …), or the row for a note or todo. */
  readonly entity: TEntity;
  readonly notes: RecallList<RecallNote>;
  readonly comments: RecallList<RecallComment>;
  /** Open todos (pending or active), highest priority first. */
  readonly todos: RecallList<RecallTodo>;
  readonly docs: RecallList<RecallDoc>;
  readonly links: RecallList<RecallLink>;
  readonly tags: readonly string[];
  /** Relations at either end, including MENTIONS backlinks ("Mentioned in"). */
  readonly relations: readonly RelationGroup[];
  /** Goals and projects this person, team or department owns. */
  readonly ownedGoals: RecallList<RecallGoal>;
  readonly ownedProjects: RecallList<RecallProject>;
  /** Text elsewhere that names this entity without linking to it. */
  readonly unlinkedMentions: RecallList<SearchHit>;
}
