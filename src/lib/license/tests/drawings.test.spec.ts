import { describe, it, expect } from 'vitest';
import { drawingAllowanceNote, drawingMenuMarks } from '../drawings';
import { hasPro } from '../pro';

const free = (used: number) => ({ used, free: 3, canAdd: used < 3, pro: false });

describe('drawingMenuMarks', () => {
  it('says how many free drawings are used, and shows the Pro icon once they\'re gone', () => {
    expect(drawingMenuMarks(free(0))).toEqual({ hint: '0 of 3 free', pro: false });
    expect(drawingMenuMarks(free(2))).toEqual({ hint: '2 of 3 free', pro: false });
    expect(drawingMenuMarks(free(3))).toEqual({ hint: '3 of 3 free', pro: true });
    // More than the free ones (made with a license that has since lapsed) still reads as all used.
    expect(drawingMenuMarks(free(7))).toEqual({ hint: '3 of 3 free', pro: true });
  });

  it('shows nothing with Remry Pro', () => {
    expect(drawingMenuMarks({ used: 12, free: 3, canAdd: true, pro: true })).toEqual({ pro: false });
  });
});

describe('drawingAllowanceNote', () => {
  it('counts the free ones, then says what to do', () => {
    expect(drawingAllowanceNote(free(1))).toBe('1 of 3 free drawings used in this notebook.');
    expect(drawingAllowanceNote(free(3))).toMatch(/^This notebook has used its 3 free drawings\. More are part of Remry Pro; its drawings stay editable either way\.$/);
    expect(drawingAllowanceNote({ used: 9, free: 3, canAdd: true, pro: true })).toBeNull();
  });
});

describe('hasPro', () => {
  it('is true only for an active license in the page data', () => {
    expect(hasPro({ license: { state: 'active', licensee: null, expires: '2099-01-01', daysLeft: 1, problem: null } })).toBe(true);
    expect(hasPro({ license: { state: 'expired', licensee: null, expires: '2020-01-01', daysLeft: -1, problem: null } })).toBe(false);
    expect(hasPro({ license: { state: 'none', licensee: null, expires: null, daysLeft: null, problem: null } })).toBe(false);
    expect(hasPro({})).toBe(false);
  });
});
