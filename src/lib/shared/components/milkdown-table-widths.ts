// Milkdown: drag a table's column borders to size its columns. The widths are percents of the
// table's width, kept on the table node (`colWidths`) and saved as a `<!-- table-cols: … -->`
// comment before the table (`lib/doc/table-widths.ts`, which the preview and the PDF read too).
// The comment never reaches the editor's document: `tableWidthsRemark` takes it out of the parsed
// tree before the table is built, and the table's serializer writes it back on save.
//
// Use `gfmWithTableWidths` in place of `gfm`, then `.use(tableWidthsRemark)`,
// `.use(tableWidthsView)` and `.use(tableResizePlugin)`. Dragging a border sets the widths (a
// table without them becomes full width, each column its current share); double-clicking a border
// clears them, and the table sizes itself again.

import type { MilkdownPlugin } from '@milkdown/ctx';
import { gfm, tableSchema } from '@milkdown/preset-gfm';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet, type EditorView, type NodeView, type ViewMutationRecord } from '@milkdown/prose/view';
import { $prose, $remark, $view } from '@milkdown/utils';
import {
  attachMdastTableWidths,
  fitsColumns,
  resizeColumn,
  roundWidths,
  tableColsComment,
  type MdastNode
} from '$lib/doc/table-widths';

const widthsOf = (node: ProseNode): readonly number[] | null => {
  const widths = node.attrs['colWidths'] as readonly number[] | null;
  return fitsColumns(widths, node.firstChild?.childCount ?? 0) ? widths : null;
};

interface MdastTable {
  readonly align?: unknown;
  readonly children: readonly Record<string, unknown>[];
  readonly data?: { readonly colWidths?: readonly number[] };
}

/** GFM's table, with its widths: read from the comment's data, written back as the comment. */
const sizedTableSchema = tableSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, colWidths: { default: null } },
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state, node, type) => {
        const table = node as unknown as MdastTable;
        // As GFM's own runner: each row learns the alignment, and the first is the header.
        const children = table.children.map((row, i) => ({ ...row, align: table.align, isHeader: i === 0 }));
        state.openNode(type, { colWidths: table.data?.colWidths ?? null });
        state.next(children as never);
        state.closeNode();
      }
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        const widths = widthsOf(node);
        if (widths) state.addNode('html', undefined, tableColsComment(widths));
        base.toMarkdown.runner(state, node);
      }
    }
  };
});

/** GFM with the table that keeps its widths, in the same place in the list. */
export const gfmWithTableWidths: MilkdownPlugin[] = gfm.flatMap((plugin) =>
  plugin === tableSchema.ctx ? sizedTableSchema : plugin === tableSchema.node ? [] : [plugin]
);

export const tableWidthsRemark = $remark('remry-table-widths', () => () => (tree: unknown) => {
  attachMdastTableWidths(tree as MdastNode);
});

/** Sets a colgroup's widths, or empties it for a table that sizes itself. */
const applyWidths = (table: HTMLTableElement, colgroup: HTMLElement, widths: readonly number[] | null): void => {
  table.classList.toggle('fixed-cols', !!widths);
  colgroup.replaceChildren(
    ...(widths ?? []).map((w) => {
      const col = document.createElement('col');
      col.style.setProperty('--col-w', `${w}%`);
      return col;
    })
  );
};

class TableWidthsView implements NodeView {
  readonly dom: HTMLTableElement;
  readonly contentDOM: HTMLElement;
  private readonly colgroup: HTMLElement;

  constructor(private node: ProseNode) {
    this.dom = document.createElement('table');
    this.colgroup = document.createElement('colgroup');
    this.contentDOM = document.createElement('tbody');
    this.dom.append(this.colgroup, this.contentDOM);
    applyWidths(this.dom, this.colgroup, widthsOf(node));
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    applyWidths(this.dom, this.colgroup, widthsOf(node));
    return true;
  }

  // The widths (and a drag's live ones) are the view's own; ProseMirror needn't re-read them.
  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection') return false;
    return mutation.target === this.dom || this.colgroup.contains(mutation.target);
  }
}

export const tableWidthsView = $view(sizedTableSchema.node, () => (node) => new TableWidthsView(node));

// ----- Dragging a border -----

/** How near a cell's edge, in pixels, the pointer grabs its border. */
const EDGE = 5;

interface Border {
  readonly table: HTMLTableElement;
  /** The column on the border's left. */
  readonly column: number;
}

/** The border between two columns under the pointer, if any. */
const borderAt = (view: EditorView, event: MouseEvent): Border | null => {
  if (!view.editable || !(event.target instanceof Element)) return null;
  const cell = event.target.closest('td, th');
  const table = cell?.closest('table');
  if (!(cell instanceof HTMLTableCellElement) || !(table instanceof HTMLTableElement) || !view.dom.contains(table)) return null;
  const rect = cell.getBoundingClientRect();
  const last = (cell.parentElement as HTMLTableRowElement).cells.length - 1;
  if (Math.abs(event.clientX - rect.right) <= EDGE && cell.cellIndex < last) return { table, column: cell.cellIndex };
  if (Math.abs(event.clientX - rect.left) <= EDGE && cell.cellIndex > 0) return { table, column: cell.cellIndex - 1 };
  return null;
};

/** The table node's position, from any cell in it. */
const tablePos = (view: EditorView, table: HTMLTableElement): number | null => {
  const cell = table.querySelector('td, th');
  if (!cell) return null;
  const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'table') return $pos.before(depth);
  }
  return null;
};

/** The widths a table shows now: its saved ones, or its columns' drawn widths as shares. */
const currentWidths = (node: ProseNode, table: HTMLTableElement): readonly number[] => {
  const saved = widthsOf(node);
  if (saved) return saved;
  const cells = [...(table.rows[0]?.cells ?? [])];
  return cells.map((cell) => cell.getBoundingClientRect().width);
};

const setWidths = (view: EditorView, pos: number, widths: readonly number[] | null): void => {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, colWidths: widths }));
};

/** The border the pointer is on: its table's position and the column on its left. */
interface Hover {
  readonly pos: number;
  readonly column: number;
}

const resizeKey = new PluginKey<Hover | null>('remry-table-resize');

const sameHover = (a: Hover | null, b: Hover | null): boolean => a?.pos === b?.pos && a?.column === b?.column;

/** The column's cells, marked so the line its border moves shows (`.col-resize-edge`). */
const columnDecorations = (doc: ProseNode, hover: Hover | null): DecorationSet => {
  const table = hover ? doc.nodeAt(hover.pos) : null;
  if (!hover || !table) return DecorationSet.empty;
  const marks: Decoration[] = [];
  let rowPos = hover.pos + 1;
  table.forEach((row) => {
    let cellPos = rowPos + 1;
    row.forEach((cell, _offset, index) => {
      if (index === hover.column) marks.push(Decoration.node(cellPos, cellPos + cell.nodeSize, { class: 'col-resize-edge' }));
      cellPos += cell.nodeSize;
    });
    rowPos += row.nodeSize;
  });
  return DecorationSet.create(doc, marks);
};

export const tableResizePlugin = $prose(() => {
  let dragging = false;

  const setHover = (view: EditorView, border: Border | null): void => {
    const pos = border ? tablePos(view, border.table) : null;
    const next = border && pos !== null ? { pos, column: border.column } : null;
    if (sameHover(resizeKey.getState(view.state) ?? null, next)) return;
    view.dispatch(view.state.tr.setMeta(resizeKey, next));
  };

  const startDrag = (view: EditorView, border: Border, event: MouseEvent): void => {
    const pos = tablePos(view, border.table);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (pos === null || !node) return;
    const start = roundWidths(currentWidths(node, border.table));
    // Measured once it's full width: a table that sized itself becomes full width on the first move.
    let tableWidth = 0;
    const startX = event.clientX;
    let widths = start;
    let moved = false;
    dragging = true;
    // Live widths straight on the table (the node view ignores them); the node takes them when the drag ends.
    const colgroup = border.table.querySelector('colgroup');
    const onMove = (move: MouseEvent): void => {
      if (!moved && colgroup) applyWidths(border.table, colgroup as HTMLElement, start);
      moved = true;
      tableWidth ||= border.table.getBoundingClientRect().width || 1;
      widths = resizeColumn(start, border.column, ((move.clientX - startX) / tableWidth) * 100);
      if (colgroup) applyWidths(border.table, colgroup as HTMLElement, widths);
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragging = false;
      // A click without a drag (half of a double-click) changes nothing.
      if (moved) setWidths(view, pos, roundWidths(widths));
      setHover(view, null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return new Plugin<Hover | null>({
    key: resizeKey,
    state: {
      init: () => null,
      apply: (tr, hover) => {
        const meta = tr.getMeta(resizeKey) as Hover | null | undefined;
        if (meta !== undefined) return meta;
        // An edit elsewhere moves the table; one that removes it ends the hover.
        if (!hover || !tr.docChanged) return hover;
        const mapped = tr.mapping.mapResult(hover.pos);
        return mapped.deleted ? null : { ...hover, pos: mapped.pos };
      }
    },
    props: {
      decorations: (state) => columnDecorations(state.doc, resizeKey.getState(state) ?? null),
      attributes: (state): Record<string, string> => (resizeKey.getState(state) ? { class: 'col-resizing' } : {}),
      handleDOMEvents: {
        mousemove: (view, event) => {
          if (!dragging) setHover(view, borderAt(view, event));
          return false;
        },
        mouseleave: (view) => {
          if (!dragging) setHover(view, null);
          return false;
        },
        mousedown: (view, event) => {
          const border = event.button === 0 ? borderAt(view, event) : null;
          if (!border) return false;
          event.preventDefault();
          startDrag(view, border, event);
          return true;
        },
        // Double-clicking a border lets the table size itself again.
        dblclick: (view, event) => {
          const border = borderAt(view, event);
          if (!border) return false;
          const pos = tablePos(view, border.table);
          if (pos === null) return false;
          event.preventDefault();
          setWidths(view, pos, null);
          return true;
        }
      }
    }
  });
});
