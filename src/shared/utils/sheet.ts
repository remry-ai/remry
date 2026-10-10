// A spreadsheet page's body: JSON in page.content when bodyType is 'sheet'.
// `data` holds what was typed (formulas included, like =SUM(B2:B5)); `values`
// is what the grid showed when it was last saved from the app, so print,
// search and Claude can read the results without evaluating formulas. A sheet
// written from the CLI or MCP may leave `values` out: it reads as `data` until
// the page is next saved in the app. Shared by the server (validation) and the
// client (the editor and the print view).

import { z } from 'zod';
import { ok, err, type Result } from './result';

export const SHEET_LIMITS = { rows: 2000, columns: 100, cell: 10_000, title: 60 } as const;

export interface SheetColumn {
  readonly title: string;
  /** Pixels, as the grid last drew it. */
  readonly width?: number;
}

export type SheetRows = readonly (readonly string[])[];

export interface SheetContent {
  readonly version: 1;
  readonly columns: readonly SheetColumn[];
  readonly data: SheetRows;
  readonly values: SheetRows;
}

const cell = z.union([z.string().max(SHEET_LIMITS.cell), z.number(), z.boolean(), z.null()]).transform((v) => (v === null ? '' : String(v)));

const rows = z.array(z.array(cell).max(SHEET_LIMITS.columns)).max(SHEET_LIMITS.rows);

const sheetSchema = z
  .object({
    version: z.literal(1).default(1),
    columns: z
      .array(z.object({ title: z.string().max(SHEET_LIMITS.title), width: z.number().int().min(20).max(2000).optional() }).strict())
      .min(1, 'needs at least one column')
      .max(SHEET_LIMITS.columns),
    data: rows,
    values: rows.optional()
  })
  .strict()
  .superRefine((sheet, ctx) => {
    const width = sheet.columns.length;
    sheet.data.forEach((row, i) => {
      if (row.length > width) ctx.addIssue({ code: 'custom', path: ['data', i], message: `has ${row.length} cells but there are ${width} columns` });
    });
  });

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export const columnLetter = (index: number): string => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** A new sheet: columns A–E and 10 empty rows. */
export const emptySheet = (columns = 5, rowCount = 10): SheetContent => {
  const blank = Array.from({ length: rowCount }, () => Array.from({ length: columns }, () => ''));
  return {
    version: 1,
    columns: Array.from({ length: columns }, (_, i) => ({ title: columnLetter(i) })),
    data: blank,
    values: blank
  };
};

/** Pads every row to the column count, so the grid and the markdown agree. */
const padRows = (input: SheetRows, width: number): SheetRows =>
  input.map((row) => (row.length >= width ? row.slice(0, width) : [...row, ...Array.from({ length: width - row.length }, () => '')]));

/** Validates a sheet (an object or its JSON); an empty string is a new, empty sheet. Errors name the cell or field. */
export const parseSheetContent = (input: unknown): Result<SheetContent> => {
  let value = input;
  if (typeof value === 'string') {
    if (!value.trim()) return ok(emptySheet());
    try {
      value = JSON.parse(value);
    } catch (e) {
      return err(new Error(`sheet content: invalid JSON (${e instanceof Error ? e.message : String(e)}). A sheet is {"columns":[{"title":"Item"}],"data":[["Rent","1200"]]}`));
    }
  }
  const parsed = sheetSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'sheet'} ${issue.message}`).join('; ');
    return err(new Error(`sheet content: ${issues}`));
  }
  const width = parsed.data.columns.length;
  const data = padRows(parsed.data.data, width);
  // Values the grid computed only stand in for data of the same shape.
  const values = parsed.data.values && parsed.data.values.length === data.length ? padRows(parsed.data.values, width) : data;
  return ok({ version: 1, columns: parsed.data.columns, data, values });
};

/** Reads a stored sheet; anything unreadable (never written by the app) reads as an empty one. */
export const readSheetContent = (raw: string): SheetContent => {
  const parsed = parseSheetContent(raw);
  return parsed.ok ? parsed.value : emptySheet();
};

const lastFilledRow = (rows: SheetRows): number => {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.some((c) => c.trim() !== '')) return i;
  return -1;
};

const escapeCell = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// The last column with a title of its own or a filled cell.
const lastUsedColumn = (sheet: SheetContent, rows: SheetRows): number => {
  for (let x = sheet.columns.length - 1; x >= 0; x--) {
    if (sheet.columns[x]!.title.trim() !== '' || rows.some((row) => (row[x] ?? '').trim() !== '')) return x;
  }
  return 0;
};

/** The sheet's computed values as a GFM table (header row from the column titles), trailing empty rows and columns dropped. */
export const sheetToMarkdown = (sheet: SheetContent): string => {
  const filled = sheet.values.slice(0, lastFilledRow(sheet.values) + 1);
  const width = lastUsedColumn(sheet, filled) + 1;
  const body = filled.map((row) => row.slice(0, width));
  const header = sheet.columns.slice(0, width).map((c, i) => escapeCell(c.title || columnLetter(i)) || ' ');
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...body.map((row) => line(row.map(escapeCell)))].join('\n');
};
