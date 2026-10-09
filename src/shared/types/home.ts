// Home dashboard: recent updates and the focus graph.

import type { RelatableType } from './enums';

export const UPDATE_KINDS = [
  'PERSON',
  'GROUP',
  'PROJECT',
  'GOAL',
  'PAGE',
  'DOC',
  'NOTE',
  'REPORT',
  'TODO'
] as const;

export type UpdateKind = (typeof UPDATE_KINDS)[number];

/** How the home page's Todos panel orders open todos. */
export const HOME_TODO_SORTS = ['priority', 'status'] as const;

export type HomeTodoSort = (typeof HOME_TODO_SORTS)[number];

/** `?todoSort=` on the home page; anything unknown is the default, priority. */
export const parseHomeTodoSort = (value: string | null): HomeTodoSort => (value === 'status' ? 'status' : 'priority');

/** One page of open todos, and how many are open in all. */
export interface HomeTodoPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface RecentUpdate {
  readonly kind: UpdateKind;
  readonly id: string;
  readonly title: string;
  readonly parentLabel: string | null;
  readonly href: string;
  readonly at: Date;
  readonly isNew: boolean;
}

// The focus graph: one entity in the middle, everything one link away grouped by
// how each link reads from the middle ("Reports to", "Owns"), and a second ring:
// what each of those links to in turn.

/** Types that can sit in the middle of the focus graph. */
export const FOCUS_TYPES = ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE'] as const;

export type FocusType = (typeof FOCUS_TYPES)[number];

export interface FocusNode {
  readonly id: string;
  readonly type: RelatableType;
  readonly label: string;
  readonly href: string;
  /** Whether it can be the middle; a doc, note, todo or report only opens. */
  readonly focusable: boolean;
}

export interface FocusGroup {
  readonly label: string;
  readonly nodes: readonly FocusNode[];
  /** Neighbours left out of this group by the cap. */
  readonly more: number;
}

/** A first-ring node's own neighbours, on the outer ring. */
export interface FocusBranch {
  readonly nodes: readonly FocusNode[];
  /** Left out by the cap. */
  readonly more: number;
}

export interface FocusGraph {
  readonly focus: FocusNode | null;
  readonly groups: readonly FocusGroup[];
  /** Keyed `TYPE:id` of a first-ring node; only nodes with something new to show have one. */
  readonly branches: Readonly<Record<string, FocusBranch>>;
}

export const focusKey = (node: Pick<FocusNode, 'type' | 'id'>): string => `${node.type}:${node.id}`;
