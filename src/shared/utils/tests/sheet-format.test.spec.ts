import { describe, expect, it } from 'vitest';
import { applyFormat, formatWithCode } from '../sheet-format';
import { evaluateSheet } from '../sheet-formula';
import { parseSheetContent } from '../sheet';

describe('applyFormat', () => {
  it('shows a column format', () => {
    expect(applyFormat(1234.5, { type: 'currency', decimals: 2, symbol: '$' })).toBe('$1,234.50');
    expect(applyFormat(-1234.5, { type: 'currency', decimals: 2, symbol: '€' })).toBe('-€1,234.50');
    expect(applyFormat(1234.5, { type: 'currency', decimals: 0, symbol: '¥' })).toBe('¥1,235');
    expect(applyFormat(1234567.891, { type: 'number', decimals: 2 })).toBe('1,234,567.89');
    expect(applyFormat(0.125, { type: 'percent', decimals: 1 })).toBe('12.5%');
    expect(applyFormat(0.125, { type: 'percent', decimals: 0 })).toBe('13%');
  });

  it('rounds half away from zero, in decimal', () => {
    expect(applyFormat(1.005, { type: 'number', decimals: 2 })).toBe('1.01');
    expect(applyFormat(-0.004, { type: 'number', decimals: 2 })).toBe('0.00');
    expect(applyFormat(0.1 + 0.2, { type: 'number', decimals: 2 })).toBe('0.30');
  });
});

describe('formatWithCode (TEXT)', () => {
  it('reads spreadsheet format codes', () => {
    expect(formatWithCode(1234.5, '$#,##0.00')).toBe('$1,234.50');
    expect(formatWithCode(1234.5, '0')).toBe('1235');
    expect(formatWithCode(3, '000')).toBe('003');
    expect(formatWithCode(0.5, '#.##')).toBe('.5');
    expect(formatWithCode(2.5, '0.0#')).toBe('2.5');
    expect(formatWithCode(2.567, '0.0#')).toBe('2.57');
    expect(formatWithCode(0.256, '0.0%')).toBe('25.6%');
    expect(formatWithCode(42, '"Total: "#,##0" kg"')).toBe('Total: 42 kg');
    expect(formatWithCode(5, '\\€0.00')).toBe('€5.00');
    expect(formatWithCode(-5, '$0.00;($0.00)')).toBe('-$5.00');
  });

  it('refuses letters outside quotes, such as date codes', () => {
    expect(formatWithCode(45000, 'yyyy-mm-dd')).toEqual({ error: expect.stringMatching(/"y" can't be read/) });
  });
});

describe('TEXT in formulas', () => {
  const one = (formula: string, cells: string[] = []) => evaluateSheet([[formula, ...cells]]);
  it('formats a number, a typed one included', () => {
    expect(one('=TEXT(B1,"$#,##0.00")', ['1200']).values[0]![0]).toBe('$1,200.00');
    expect(one('=TEXT(B1*2,"0%")', ['$0.25']).values[0]![0]).toBe('50%');
    expect(one('="Total: "&TEXT(SUM(B1:C1),"#,##0")', ['1000', '2500']).values[0]![0]).toBe('Total: 3,500');
  });

  it('gives text back as it is, and explains a bad code', () => {
    expect(one('=TEXT(B1,"0.00")', ['n/a']).values[0]![0]).toBe('n/a');
    const bad = one('=TEXT(1,"dd/mm")');
    expect(bad.values[0]![0]).toBe('#VALUE!');
    expect(bad.problems[0]?.message).toMatch(/TEXT formats numbers/);
  });
});

describe('column formats', () => {
  const money = { type: 'currency', decimals: 2, symbol: '$' } as const;

  it('shows typed numbers and formula results in the column format, and leaves text alone', () => {
    const { values } = evaluateSheet([['Rent', '1200'], ['Food', '$400.5'], ['Note', 'n/a'], ['Total', '=SUM(B1:B3)'], ['Label', '=TEXT(B4,"0")']], [undefined, money]);
    expect(values.map((r) => r[1])).toEqual(['$1,200.00', '$400.50', 'n/a', '$1,600.50', '1601']);
    expect(values[0]![0]).toBe('Rent');
  });

  it('keeps formulas reading what was typed', () => {
    const { values } = evaluateSheet([['0.5', '=A1*2']], [{ type: 'percent', decimals: 0 }]);
    expect(values[0]).toEqual(['50%', '1']);
  });

  it('is saved with the sheet, and a currency without a symbol is in dollars', () => {
    const parsed = parseSheetContent({ columns: [{ title: 'Item' }, { title: 'Cost', format: { type: 'currency', decimals: 2 } }], data: [['Rent', '1200']] });
    expect(parsed.ok && parsed.value.columns[1]?.format).toEqual({ type: 'currency', decimals: 2, symbol: '$' });
    expect(parsed.ok && parsed.value.values[0]).toEqual(['Rent', '$1,200.00']);
  });

  it('refuses a format it does not know', () => {
    const bad = parseSheetContent({ columns: [{ title: 'Cost', format: { type: 'currency', decimals: 2, symbol: 'CHF' } }], data: [] });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error.message).toMatch(/columns\.0\.format\.symbol/);
  });
});
