import { describe, it, expect } from 'vitest';
import { Lexer, type Token } from 'marked';
import {
  attachMdastTableWidths,
  attachTableWidths,
  fitsColumns,
  isTableColsComment,
  parseTableCols,
  resizeColumn,
  roundWidths,
  tableColsComment,
  type MdastNode,
  type SizedTable
} from '../table-widths';

const lex = (md: string): Token[] => attachTableWidths(new Lexer({ gfm: true }).lex(md));
const tables = (tokens: readonly Token[]): SizedTable[] => tokens.filter((t) => t.type === 'table') as SizedTable[];
const TABLE = '| Item | Cost | Notes |\n|---|---|---|\n| Laptops | 4000 | For the new hires |';

describe('the width comment', () => {
  it('reads widths as percents summing to 100', () => {
    expect(parseTableCols('<!-- table-cols: 30, 20, 50 -->')).toEqual([30, 20, 50]);
    expect(parseTableCols('<!--table-cols:1,1-->')).toEqual([50, 50]);
    expect(parseTableCols('<!-- table-cols: 30%, 70% -->')).toEqual([30, 70]);
    expect(parseTableCols('<!-- table-cols: 1, 1, 1 -->')).toEqual([34, 33, 33]);
  });

  it('refuses nonsense, but still knows it for a width comment', () => {
    for (const bad of ['<!-- table-cols: -->', '<!-- table-cols: 100 -->', '<!-- table-cols: a, b -->', '<!-- table-cols: 0, 10 -->']) {
      expect(parseTableCols(bad)).toBeNull();
      expect(isTableColsComment(bad)).toBe(true);
    }
    expect(isTableColsComment('<!-- pagebreak -->')).toBe(false);
  });

  it('writes the comment back', () => {
    expect(tableColsComment([30.4, 19.6, 50])).toBe('<!-- table-cols: 30, 20, 50 -->');
    expect(parseTableCols(tableColsComment([12, 88]))).toEqual([12, 88]);
  });

  it('rounds to whole percents without losing the total', () => {
    expect(roundWidths([33.3, 33.3, 33.4])).toEqual([33, 33, 34]);
    expect(roundWidths([2, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(roundWidths([])).toEqual([]);
  });

  it('fits only a table with the same number of columns', () => {
    expect(fitsColumns([50, 50], 2)).toBe(true);
    expect(fitsColumns([50, 50], 3)).toBe(false);
    expect(fitsColumns(null, 2)).toBe(false);
  });
});

describe('resizeColumn', () => {
  it('moves one border: the column and the next change, the rest stay', () => {
    expect(resizeColumn([30, 20, 50], 0, 10)).toEqual([40, 10, 50]);
    expect(resizeColumn([30, 20, 50], 1, -5)).toEqual([30, 15, 55]);
  });

  it('keeps every column at least 5%', () => {
    expect(resizeColumn([30, 20, 50], 0, 50)).toEqual([45, 5, 50]);
    expect(resizeColumn([30, 20, 50], 0, -50)).toEqual([5, 45, 50]);
  });

  it('ignores the last column, which has no border to its right', () => {
    expect(resizeColumn([30, 70], 1, 10)).toEqual([30, 70]);
  });
});

describe('attachTableWidths (marked)', () => {
  it('puts the widths on the table and drops the comment', () => {
    const tokens = lex(`Intro\n\n<!-- table-cols: 30, 20, 50 -->\n\n${TABLE}`);
    expect(tables(tokens)[0]!.colWidths).toEqual([30, 20, 50]);
    expect(tokens.some((t) => t.type === 'html')).toBe(false);
  });

  it('works with the comment right above the table, too', () => {
    expect(tables(lex(`<!-- table-cols: 30, 20, 50 -->\n${TABLE}`))[0]?.colWidths).toEqual([30, 20, 50]);
  });

  it('ignores widths for a different number of columns, and still drops the comment', () => {
    const tokens = lex(`<!-- table-cols: 50, 50 -->\n\n${TABLE}`);
    expect(tables(tokens)[0]!.colWidths).toBeUndefined();
    expect(tokens.some((t) => t.type === 'html')).toBe(false);
  });

  it('drops a comment with no table after it, and sizes only the table right after one', () => {
    const tokens = lex(`<!-- table-cols: 30, 20, 50 -->\n\nA paragraph.\n\n${TABLE}`);
    expect(tokens.some((t) => t.type === 'html')).toBe(false);
    expect(tables(tokens)[0]!.colWidths).toBeUndefined();
  });

  it('finds tables in quotes and lists', () => {
    const quoted = lex(`> <!-- table-cols: 30, 20, 50 -->\n>\n> ${TABLE.split('\n').join('\n> ')}`);
    const quote = quoted.find((t) => t.type === 'blockquote') as { tokens: Token[] };
    expect(tables(quote.tokens)[0]?.colWidths).toEqual([30, 20, 50]);
  });

  it('leaves other comments alone', () => {
    expect(lex('<!-- pagebreak -->').some((t) => t.type === 'html')).toBe(true);
  });
});

describe('attachMdastTableWidths (the editor)', () => {
  const table = (columns: number): MdastNode => ({
    type: 'table',
    children: [{ type: 'tableRow', children: Array.from({ length: columns }, () => ({ type: 'tableCell', children: [] })) }]
  });

  it('moves the widths onto the table and takes the comment out', () => {
    const tree: MdastNode = { type: 'root', children: [{ type: 'html', value: '<!-- table-cols: 30, 70 -->' }, table(2)] };
    attachMdastTableWidths(tree);
    expect(tree.children).toHaveLength(1);
    expect(tree.children![0]!.data?.colWidths).toEqual([30, 70]);
  });

  it('also finds the comment once Milkdown has wrapped it in a paragraph', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'html', value: '<!-- table-cols: 30, 70 -->' }] }, table(2)]
    };
    attachMdastTableWidths(tree);
    expect(tree.children!.map((n) => n.type)).toEqual(['table']);
    expect(tree.children![0]!.data?.colWidths).toEqual([30, 70]);
  });

  it('drops a comment that fits no table, and keeps other html', () => {
    const tree: MdastNode = {
      type: 'root',
      children: [{ type: 'html', value: '<!-- table-cols: 30, 70 -->' }, table(3), { type: 'html', value: '<!-- pagebreak -->' }]
    };
    attachMdastTableWidths(tree);
    expect(tree.children!.map((n) => n.type)).toEqual(['table', 'html']);
    expect(tree.children![0]!.data?.colWidths).toBeUndefined();
  });
});
