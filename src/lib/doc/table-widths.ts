// A table's column widths, set by dragging its column borders in the editor. Markdown tables
// have no widths, so they're saved as a comment on the line before the table, in percent of
// the table's width:
//
//   <!-- table-cols: 30, 20, 50 -->
//
//   | Item | Cost | Notes |
//
// The comment is never shown: the preview, the print page and the PDF lex it out and size the
// table's columns from it (`attachTableWidths`), and the editor takes it out of the parsed tree
// before building the table (`attachMdastTableWidths`), writing it back on save. A comment whose
// count doesn't match its table's columns (a column added since) is ignored, and the table sizes
// itself as before. Pure.

import type { Token, Tokens } from 'marked';

/** No column narrower than this, in percent, so a drag can't make one vanish. */
export const MIN_COLUMN_PERCENT = 5;

const COMMENT = /^<!--\s*table-cols\s*:([^>]*?)-->$/i;

/** True for a `<!-- table-cols: … -->` comment, valid or not: either way it's never shown. */
export const isTableColsComment = (html: string): boolean => COMMENT.test(html.trim());

/** Widths that sum to 100, as whole percents (largest remainder, so the total stays exact). */
export const roundWidths = (widths: readonly number[]): readonly number[] => {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (widths.length === 0 || total <= 0) return [];
  const exact = widths.map((w) => (w / total) * 100);
  const floored = exact.map(Math.floor);
  let left = 100 - floored.reduce((sum, w) => sum + w, 0);
  const byRemainder = exact.map((w, i) => ({ i, rest: w - Math.floor(w) })).sort((a, b) => b.rest - a.rest);
  const result = [...floored];
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    result[i]! += 1;
    left -= 1;
  }
  return result;
};

/** The widths a comment holds, as percents summing to 100; null when it isn't one or holds nonsense. */
export const parseTableCols = (html: string): readonly number[] | null => {
  const match = COMMENT.exec(html.trim());
  if (!match) return null;
  const parts = match[1]!.split(',').map((part) => part.trim().replace(/%$/, ''));
  if (parts.length < 2) return null;
  const widths = parts.map(Number);
  if (widths.some((w) => !Number.isFinite(w) || w <= 0)) return null;
  return roundWidths(widths);
};

/** The comment that saves these widths. */
export const tableColsComment = (widths: readonly number[]): string => `<!-- table-cols: ${roundWidths(widths).join(', ')} -->`;

/** Widths that can size a table of `columns` columns. */
export const fitsColumns = (widths: readonly number[] | null | undefined, columns: number): widths is readonly number[] =>
  !!widths && widths.length === columns && columns > 1;

/**
 * Moves the border on the right of column `index` by `deltaPercent` (positive widens it): only
 * that column and the next one change, and neither goes below `MIN_COLUMN_PERCENT`.
 */
export const resizeColumn = (widths: readonly number[], index: number, deltaPercent: number): readonly number[] => {
  const left = widths[index];
  const right = widths[index + 1];
  if (left === undefined || right === undefined) return widths;
  const pair = left + right;
  const nextLeft = Math.min(Math.max(left + deltaPercent, MIN_COLUMN_PERCENT), pair - MIN_COLUMN_PERCENT);
  return widths.map((w, i) => (i === index ? nextLeft : i === index + 1 ? pair - nextLeft : w));
};

// ----- marked tokens (the preview, the print page, the PDF) -----

/** A table token that carries its saved widths. */
export interface SizedTable extends Tokens.Table {
  readonly colWidths?: readonly number[];
}

/** Tokens that hold blocks of their own, where a table can sit. */
const childBlocks = (token: Token): Token[] | null => {
  if (token.type === 'blockquote') return (token as Tokens.Blockquote).tokens;
  return null;
};

/**
 * The tokens with every width comment taken out, and each table after one (blank lines between
 * are fine) carrying its widths when they fit its columns. Lists and quotes are walked too.
 */
export const attachTableWidths = (tokens: readonly Token[]): Token[] => {
  const out: Token[] = [];
  let pending: readonly number[] | null = null;
  for (const token of tokens) {
    if (token.type === 'html' && isTableColsComment((token as Tokens.HTML).text)) {
      pending = parseTableCols((token as Tokens.HTML).text);
      continue;
    }
    if (token.type === 'space') {
      out.push(token);
      continue;
    }
    if (token.type === 'table') {
      const table = token as Tokens.Table;
      out.push(fitsColumns(pending, table.header.length) ? ({ ...table, colWidths: pending } as SizedTable) : table);
    } else if (token.type === 'list') {
      const list = token as Tokens.List;
      out.push({ ...list, items: list.items.map((item) => ({ ...item, tokens: attachTableWidths(item.tokens) })) } as Tokens.List);
    } else {
      const children = childBlocks(token);
      out.push(children ? ({ ...token, tokens: attachTableWidths(children) } as Token) : token);
    }
    pending = null;
  }
  return out;
};

// ----- mdast (the editor, which parses with remark) -----

export interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
}

/** An html node, or the paragraph Milkdown wraps a block-level one in. */
const commentText = (node: MdastNode): string | null => {
  if (node.type === 'html') return node.value ?? '';
  const only = node.type === 'paragraph' && node.children?.length === 1 ? node.children[0]! : null;
  return only?.type === 'html' ? (only.value ?? '') : null;
};

const columnCount = (table: MdastNode): number => table.children?.[0]?.children?.length ?? 0;

/**
 * Takes every width comment out of the tree and puts its widths on the table after it, as
 * `data.colWidths`, when they fit its columns. Mutates `tree`.
 */
export const attachMdastTableWidths = (tree: MdastNode): void => {
  const walk = (node: MdastNode): void => {
    if (!node.children) return;
    const kept: MdastNode[] = [];
    let pending: readonly number[] | null = null;
    for (const child of node.children) {
      const html = commentText(child);
      if (html !== null && isTableColsComment(html)) {
        pending = parseTableCols(html);
        continue;
      }
      if (child.type === 'table' && fitsColumns(pending, columnCount(child))) {
        child.data = { ...child.data, colWidths: pending };
      }
      pending = null;
      kept.push(child);
      walk(child);
    }
    node.children = kept;
  };
  walk(tree);
};
