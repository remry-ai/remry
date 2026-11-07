import { describe, it, expect } from 'vitest';
import { evaluateSheet, parseCellNumber } from '../sheet-formula';

const values = (rows: string[][]) => evaluateSheet(rows).values;
const one = (formula: string, rows: string[][] = [[]]) => evaluateSheet([[formula, ...(rows[0] ?? [])], ...rows.slice(1)]).values[0]![0];

describe('evaluateSheet', () => {
  it('works out the everyday formulas', () => {
    const rows = [
      ['Rent', '1,200'],
      ['Food', '$400.50'],
      ['Fun', ''],
      ['Total', '=SUM(B1:B3)'],
      ['Average', '=AVERAGE(B1:B3)'],
      ['Most', '=MAX(B1:B3)'],
      ['Count', '=COUNT(B1:B3)'],
      ['Big?', '=IF(B4>1500,"over","under")']
    ];
    expect(values(rows).map((r) => r[1])).toEqual(['1,200', '$400.50', '', '1600.5', '800.25', '1200', '2', 'over']);
  });

  it('follows references between formulas, and keeps arithmetic free of float noise', () => {
    expect(values([['=B1*2', '=C1+1', '0.1'], ['=0.1+0.2', '=2^10', '=10%']])).toEqual([['2.2', '1.1', '0.1'], ['0.3', '1024', '0.1']]);
    expect(one('="Total: "&ROUND(2/3,2)')).toBe('Total: 0.67');
    expect(one('=sum(1,2)'.toUpperCase())).toBe('3');
  });

  it('says what went wrong, and where', () => {
    const { values: shown, problems } = evaluateSheet([['=SUMM(B1)', '=1/0', '=A2'], ['=B2+1', '=C1', '=SUM(1,']]);
    expect(shown).toEqual([['#NAME?', '#DIV/0!', '#CYCLE!'], ['#CYCLE!', '#CYCLE!', '#ERROR!']]);
    expect(problems.map((p) => `${p.cell} ${p.code} ${p.message}`)).toEqual([
      "A1 #NAME? There's no function SUMM.",
      'B1 #DIV/0! Divides by zero (or by an empty cell).',
      'C1 #CYCLE! C1 refers back to itself, directly or through other cells.',
      'A2 #CYCLE! C1 refers back to itself, directly or through other cells.',
      'B2 #CYCLE! C1 refers back to itself, directly or through other cells.',
      "C2 #ERROR! The formula stops before it's finished."
    ]);
    expect(evaluateSheet([['=A1+"x"']]).problems[0]?.message).toMatch(/refers back to itself/);
    expect(evaluateSheet([['="a"*2']]).problems[0]?.message).toBe('"a" isn\'t a number.');
    expect(evaluateSheet([['=B1:B3+1']]).problems[0]?.message).toMatch(/range .* can only go in a function/);
  });

  it('treats empty and off-sheet cells as empty, as Excel does', () => {
    expect(one('=Z99+1')).toBe('1');
    expect(one('=SUM(B1:B50)', [['5']])).toBe('5');
  });
});

describe('parseCellNumber', () => {
  it('reads numbers as people type them, and nothing else', () => {
    expect([' 1,200 ', '$15.49', '-3.5', '12%', '1e3', '€9'].map(parseCellNumber)).toEqual([1200, 15.49, -3.5, 0.12, 1000, 9]);
    expect(['', 'abc', '1.2.3', '12 apples'].map(parseCellNumber)).toEqual([null, null, null, null]);
  });
});
