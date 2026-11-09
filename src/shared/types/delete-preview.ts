// What deleting a person, group, project, goal or page takes with it (`entity.deletePreview`,
// src/api/entity/delete-preview.ts), and the lists the app's confirmation shows for it.

export const PREVIEWABLE_TYPES = ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE'] as const;
export type PreviewableType = (typeof PREVIEWABLE_TYPES)[number];

export interface NamedItem {
  readonly id: string;
  readonly title: string;
}

export interface DeletePreview {
  readonly name: string;
  /** Deleted with it. */
  readonly docs: readonly NamedItem[];
  readonly todos: readonly NamedItem[];
  /** Files uploaded as links: the files go too. */
  readonly files: readonly NamedItem[];
  /** Other links (addresses); only the link goes. */
  readonly links: readonly NamedItem[];
  readonly notes: number;
  readonly comments: number;
  readonly checkIns: number;
  /** Its sub-projects, sub-goals or sub-pages at any depth, top down: deleted with it. */
  readonly children: readonly NamedItem[];
  /** Kept: projects and goals it owned, left without an owner. */
  readonly owned: readonly (NamedItem & { readonly type: 'PROJECT' | 'GOAL' })[];
}

export interface PreviewSection {
  /** "3 docs", "1 file". */
  readonly heading: string;
  /** Item titles; empty for what's only counted (notes, comments, check-ins). */
  readonly items: readonly string[];
}

export interface PreviewSections {
  readonly deleted: readonly PreviewSection[];
  readonly kept: readonly PreviewSection[];
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const CHILD_WORDS: Readonly<Record<PreviewableType, readonly [string, string]>> = {
  PERSON: ['item', 'items'],
  GROUP: ['item', 'items'],
  PROJECT: ['sub-project', 'sub-projects'],
  GOAL: ['sub-goal', 'sub-goals'],
  PAGE: ['sub-page', 'sub-pages']
};

/** The confirmation's lists, in reading order, leaving out anything empty. */
export const deletePreviewSections = (type: PreviewableType, preview: DeletePreview): PreviewSections => {
  const titled = (items: readonly NamedItem[], one: string, many?: string): PreviewSection[] =>
    items.length > 0 ? [{ heading: count(items.length, one, many), items: items.map((i) => i.title) }] : [];
  const counted = (n: number, one: string): PreviewSection[] => (n > 0 ? [{ heading: count(n, one), items: [] }] : []);
  const [childOne, childMany] = CHILD_WORDS[type];
  return {
    deleted: [
      ...titled(preview.children, childOne, childMany),
      ...titled(preview.docs, 'doc'),
      ...titled(preview.todos, 'todo'),
      ...titled(preview.files, 'file'),
      ...titled(preview.links, 'link'),
      ...counted(preview.notes, 'note'),
      ...counted(preview.comments, 'comment'),
      ...counted(preview.checkIns, 'check-in')
    ],
    kept: [
      ...(preview.owned.length > 0
        ? [{ heading: `${count(preview.owned.length, 'project or goal', 'projects and goals')} it owns ${preview.owned.length === 1 ? 'loses its' : 'lose their'} owner`, items: preview.owned.map((o) => o.title) }]
        : [])
    ]
  };
};

/** Nothing goes with it and nothing moves: the plain two-click confirm is enough. */
export const isEmptyPreview = (sections: PreviewSections): boolean => sections.deleted.length === 0 && sections.kept.length === 0;
