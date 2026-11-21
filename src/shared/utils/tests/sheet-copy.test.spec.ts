import { describe, expect, it } from 'vitest';
import { pasteCopiedCells, shiftFormula, toClipboardText, type CopiedCells } from '../sheet-copy';

describe('shiftFormula', () => {
  it('moves references by the offset', () => {
    expect(shiftFormula('=B2*C2', 0, 1)).toBe('=B3*C3');
    expect(shiftFormula('=SUM(B2:B5)', 1, 0)).toBe('=SUM(C2:C5)');
    expect(shiftFormula('=Z1+1', 1, 2)).toBe('=AA3+1');
  });

  it('keeps what a $ pins', () => {
    expect(shiftFormula('=$B2+B$2+$B$2', 1, 1)).toBe('=$B3+C$2+$B$2');
  });

  it('leaves quoted text, function names and numbers alone', () => {
    expect(shiftFormula('="B2 is "&B2', 0, 1)).toBe('="B2 is "&B3');
    expect(shiftFormula('="say ""A1"""&A1', 1, 0)).toBe('="say ""A1"""&B1');
    expect(shiftFormula('=LOG10(A1)*2.5e3', 0, 1)).toBe('=LOG10(A2)*2.5e3');
    expect(shiftFormula('=IF(TRUE,A1,0)', 0, 1)).toBe('=IF(TRUE,A2,0)');
  });

  it('turns a reference moved off the sheet into #REF!', () => {
    expect(shiftFormula('=A1+B2', -1, 0)).toBe('=#REF!+A2');
  });

  it("doesn't touch text that isn't a formula", () => {
    expect(shiftFormula('B2 and C3', 1, 1)).toBe('B2 and C3');
  });
});

describe('toClipboardText', () => {
  it('joins with tabs and line breaks, quoting cells that need it', () => {
    expect(toClipboardText([['a', 'b'], ['say "hi"', 'two\nlines']])).toBe('a\tb\r\n"say ""hi"""\t"two\nlines"');
  });
});

describe('pasteCopiedCells', () => {
  const copied: CopiedCells = {
    x: 3,
    y: 1,
    raw: [['=B2*C2', 'note']],
    shown: [['6', 'note']],
    cut: false
  };

  it('pastes the formulas, moved, when the copied cells come back', () => {
    expect(pasteCopiedCells([['6', 'note']], copied, 3, 4)).toEqual([['=B5*C5', 'note']]);
  });

  it('moves each repeat when filling a larger selection', () => {
    expect(pasteCopiedCells([['6', 'note'], ['6', 'note']], copied, 3, 2)).toEqual([['=B3*C3', 'note'], ['=B4*C4', 'note']]);
    expect(pasteCopiedCells([['6', 'note', '6', 'note']], copied, 3, 1)).toEqual([['=B2*C2', 'note', '=D2*E2', 'note']]);
  });

  it('moves a cut formula unchanged', () => {
    expect(pasteCopiedCells([['6', 'note']], { ...copied, cut: true }, 0, 9)).toEqual([['=B2*C2', 'note']]);
  });

  it('leaves other text to paste as it is', () => {
    expect(pasteCopiedCells([['7', 'note']], copied, 3, 4)).toBeNull();
    expect(pasteCopiedCells([['6']], copied, 3, 4)).toBeNull();
    expect(pasteCopiedCells([['6', 'note']], null, 3, 4)).toBeNull();
  });
});
