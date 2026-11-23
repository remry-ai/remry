// What a markdown export can hold: a wiki page and its sub-pages, a project with its docs
// and sub-projects, or one doc. `entity.exportTree` returns it; the export dialog lets the
// user pick which branches go in, and `lib/doc/markdown-export.ts` writes the files.

import type { BodyType } from './body-types';

export const EXPORT_ROOT_TYPES = ['PAGE', 'PROJECT', 'DOC'] as const;
export type ExportNodeKind = (typeof EXPORT_ROOT_TYPES)[number];

export interface ExportNode {
  readonly kind: ExportNodeKind;
  readonly id: string;
  readonly title: string;
  /** A page's or doc's body type; a project's is 'doc' (its brief). */
  readonly bodyType: BodyType;
  /** A page's or doc's content as stored; a project's description. */
  readonly content: string;
  /** A project's status, else null. */
  readonly status: string | null;
  /** A doc's sync prompt or a sync page's, else null. */
  readonly prompt: string | null;
  /** A page's sub-pages, or a project's docs then its sub-projects, in the app's order. */
  readonly children: readonly ExportNode[];
}

/** Every node in the tree, top down. */
export const flattenExportTree = (root: ExportNode): readonly ExportNode[] => [
  root,
  ...root.children.flatMap(flattenExportTree)
];
