// Link editing for the Milkdown toolbar: find the link at the selection and
// set, change or remove its URL. Pure over ProseMirror state; the caller dispatches.

import type { MarkType } from '@milkdown/prose/model';
import type { EditorState, Transaction } from '@milkdown/prose/state';

export interface LinkRange {
  readonly from: number;
  readonly to: number;
  readonly href: string;
}

/** The whole link around the cursor (or the selection's start), or null when there is none. */
export const findLinkRange = (state: EditorState, type: MarkType): LinkRange | null => {
  const $from = state.selection.$from;
  const parent = $from.parent;
  const start = $from.start();
  const offset = $from.parentOffset;

  // Inline children with their positions, to find the run of link text around the cursor.
  const children: { from: number; to: number; href: string | null }[] = [];
  parent.forEach((child, childOffset) => {
    const mark = type.isInSet(child.marks);
    children.push({
      from: start + childOffset,
      to: start + childOffset + child.nodeSize,
      href: mark ? String(mark.attrs['href'] ?? '') : null,
    });
  });

  const pos = start + offset;
  const index = children.findIndex(c => c.href !== null && c.from <= pos && pos <= c.to);
  if (index === -1) return null;

  const href = children[index]!.href!;
  let first = index;
  let last = index;
  while (first > 0 && children[first - 1]!.href === href) first -= 1;
  while (last < children.length - 1 && children[last + 1]!.href === href) last += 1;
  return { from: children[first]!.from, to: children[last]!.to, href };
};

/**
 * Sets the link at the selection to `href`, or removes it when `href` is blank.
 * With a selection, links the selected text. With only a cursor, changes the link
 * it's in, or inserts the URL itself as linked text.
 */
export const applyLink = (state: EditorState, type: MarkType, href: string): Transaction | null => {
  const url = href.trim();
  const { from, to, empty } = state.selection;
  const range = findLinkRange(state, type);
  const tr = state.tr;

  if (!url) {
    if (!empty) return tr.removeMark(from, to, type);
    return range ? tr.removeMark(range.from, range.to, type) : null;
  }

  const mark = type.create({ href: url });
  if (!empty) return tr.removeMark(from, to, type).addMark(from, to, mark);
  if (range) return tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, mark);
  return tr.insertText(url, from).addMark(from, from + url.length, mark);
};
