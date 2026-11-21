// Copying and pasting formulas, as Excel and Google Sheets do: a formula pasted
// somewhere else has its cell references moved by as far as it moved, so =B2*C2
// copied one row down becomes =B3*C3. A `$` pins what follows it: $B2 keeps its
// column, B$2 its row, $B$2 both. Cut and paste moves a formula unchanged.
//
// What goes on the clipboard is what the cells show (results, formatted), so a
// paste into another app gets the numbers. The grid remembers what it copied;
// when what's pasted back is that same text, the cells' formulas go in instead,
// moved. Text from anywhere else pastes as it is. Pure.

import { columnLetter } from './sheet';

/** A reference's column letters to its index: A → 0, AA → 26. */
const columnIndex = (letters: string): number => {
  let x = 0;
  for (const ch of letters) x = x * 26 + (ch.charCodeAt(0) - 64);
  return x - 1;
};

// A cell reference (with its optional $ pins), standing alone as a word.
const REFERENCE = /^(\$?)([A-Z]{1,3})(\$?)(\d{1,6})$/;

/**
 * A formula with its references moved `dx` columns and `dy` rows, except the
 * parts pinned with `$`. Quoted text and function names stay as they are; a
 * reference moved off the top or left of the sheet becomes #REF!, as in Excel.
 * Anything that isn't a formula is returned unchanged.
 */
export const shiftFormula = (raw: string, dx: number, dy: number): string => {
  if (!raw.startsWith('=') || (dx === 0 && dy === 0)) return raw;
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '"') {
      // Quoted text, with "" for a quote inside it, is copied as it is.
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '"' && raw[j + 1] === '"') { j += 2; continue; }
        if (raw[j] === '"') break;
        j++;
      }
      out += raw.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // The same words the formula engine reads: a name, or a cell such as $B$2.
    const word = /^\$?[A-Za-z_][A-Za-z0-9_.]*\$?\d*/.exec(raw.slice(i));
    if (word) {
      const text = word[0];
      const ref = REFERENCE.exec(text.toUpperCase());
      // A word right before "(" is a function, even if it looks like a cell (LOG10).
      const isFunction = /^\s*\(/.test(raw.slice(i + text.length));
      if (ref && !isFunction) {
        const [, pinX, letters, pinY, digits] = ref;
        const x = pinX ? columnIndex(letters!) : columnIndex(letters!) + dx;
        const y = pinY ? Number(digits) - 1 : Number(digits) - 1 + dy;
        out += x < 0 || y < 0 ? '#REF!' : `${pinX}${columnLetter(x)}${pinY}${y + 1}`;
      } else {
        out += text;
      }
      i += text.length;
      continue;
    }
    // A number (2.5e3) as a whole, so its digits are never read as part of a word.
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(raw.slice(i));
    if (num) { out += num[0]; i += num[0].length; continue; }
    out += ch;
    i++;
  }
  return out;
};

/** Cells as tab-separated text, as spreadsheets put them on the clipboard. */
export const toClipboardText = (rows: readonly (readonly string[])[]): string =>
  rows
    .map((row) => row.map((cell) => (/[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join('\t'))
    .join('\r\n');

/** What the grid copied: where from, each cell as typed, and as shown (what the clipboard got). */
export interface CopiedCells {
  readonly x: number;
  readonly y: number;
  readonly raw: readonly (readonly string[])[];
  readonly shown: readonly (readonly string[])[];
  /** A cut: its formulas move unchanged. */
  readonly cut: boolean;
}

/**
 * What to paste at column `x`, row `y`: when `pasted` is the copied cells (or
 * them repeated, to fill a larger selection), their formulas, each moved from
 * where it was copied to where it lands. Null when it's other text, to paste
 * as it is.
 */
export const pasteCopiedCells = (
  pasted: readonly (readonly string[])[],
  copied: CopiedCells | null,
  x: number,
  y: number
): string[][] | null => {
  if (!copied) return null;
  const height = copied.shown.length;
  const width = copied.shown[0]?.length ?? 0;
  if (height === 0 || width === 0 || pasted.length % height !== 0) return null;
  const matches = pasted.every((row, r) =>
    row.length % width === 0 && row.every((cell, c) => cell === copied.shown[r % height]![c % width]));
  if (!matches) return null;
  return pasted.map((row, r) =>
    row.map((_, c) => {
      const raw = copied.raw[r % height]?.[c % width] ?? '';
      if (copied.cut) return raw;
      // Each repeat moves from the copied cell to where it lands.
      return shiftFormula(raw, x + c - (copied.x + (c % width)), y + r - (copied.y + (r % height)));
    }));
};
