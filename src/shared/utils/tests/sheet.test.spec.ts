import { describe, it, expect } from 'vitest';
import { columnLetter, emptySheet, parseSheetContent, readSheetContent, sheetToMarkdown } from '../sheet';

describe('columnLetter', () => {
  it('counts like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});

describe('emptySheet', () => {
  it('has lettered columns and blank rows', () => {
    const sheet = emptySheet(3, 2);
    expect(sheet.columns.map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(sheet.data).toEqual([['', '', ''], ['', '', '']]);
    expect(sheet.values).toEqual(sheet.data);
  });
});

describe('parseSheetContent', () => {
  it('reads an empty string as a new sheet', () => {
    const parsed = parseSheetContent('');
    expect(parsed.ok && parsed.value).toEqual(emptySheet());
  });

  it('pads short rows, turns numbers and nulls into text, and uses data when values are missing', () => {
    const parsed = parseSheetContent(JSON.stringify({ columns: [{ title: 'Item' }, { title: 'Cost' }], data: [['Rent', 1200], [null]] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.data).toEqual([['Rent', '1200'], ['', '']]);
    expect(parsed.value.values).toEqual(parsed.value.data);
  });

  it('keeps computed values of the same shape', () => {
    const parsed = parseSheetContent({ columns: [{ title: 'A' }], data: [['1'], ['=A1*2']], values: [['1'], ['2']] });
    expect(parsed.ok && parsed.value.values).toEqual([['1'], ['2']]);
  });

  it('ignores computed values of a different shape', () => {
    const parsed = parseSheetContent({ columns: [{ title: 'A' }], data: [['1'], ['=A1*2']], values: [['1']] });
    expect(parsed.ok && parsed.value.values).toEqual([['1'], ['=A1*2']]);
  });

  it('names the problem', () => {
    const wide = parseSheetContent({ columns: [{ title: 'A' }], data: [['1', '2']] });
    expect(!wide.ok && wide.error.message).toMatch(/data\.0 has 2 cells but there are 1 columns/);
    const json = parseSheetContent('{nope');
    expect(!json.ok && json.error.message).toMatch(/invalid JSON/);
    const none = parseSheetContent({ columns: [], data: [] });
    expect(!none.ok && none.error.message).toMatch(/at least one column/);
  });
});

describe('readSheetContent', () => {
  it('reads unreadable content as an empty sheet', () => {
    expect(readSheetContent('not json')).toEqual(emptySheet());
  });
});

describe('sheetToMarkdown', () => {
  it('prints the values as a table, dropping trailing empty rows and escaping pipes', () => {
    const sheet = readSheetContent(JSON.stringify({
      columns: [{ title: 'Item' }, { title: '' }],
      data: [['Rent', '1200'], ['A|B', '=B1'], ['', '']],
      values: [['Rent', '1200'], ['A|B', '1200'], ['', '']]
    }));
    expect(sheetToMarkdown(sheet)).toBe(['| Item | B |', '| --- | --- |', '| Rent | 1200 |', '| A\\|B | 1200 |'].join('\n'));
  });

  it('drops trailing columns with no title and no values', () => {
    const sheet = readSheetContent(JSON.stringify({ columns: [{ title: '' }, { title: '' }, { title: '' }], data: [['x', '', '']] }));
    expect(sheetToMarkdown(sheet)).toBe(['| A |', '| --- |', '| x |'].join('\n'));
  });
});
