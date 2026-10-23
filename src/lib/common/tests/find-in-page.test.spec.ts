import { describe, expect, it } from 'vitest';
import { findAgainDirection, isFindShortcut, matchLabel, matchOffsets, stepIndex } from '../find-in-page';

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods,
});

describe('find in page', () => {
  it('finds every match, ignoring case, without overlaps', () => {
    expect(matchOffsets('Budget, budget, BUDGET', 'budget')).toEqual([0, 8, 16]);
    expect(matchOffsets('aaaa', 'aa')).toEqual([0, 2]);
    expect(matchOffsets('nothing here', 'x')).toEqual([]);
    expect(matchOffsets('anything', '')).toEqual([]);
  });

  it('steps through matches and wraps round', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });

  it('labels the count', () => {
    expect(matchLabel(2, 12, 'q')).toBe('3 of 12');
    expect(matchLabel(-1, 0, 'q')).toBe('No matches');
    expect(matchLabel(-1, 0, '')).toBe('');
  });

  it('knows its shortcuts', () => {
    expect(isFindShortcut(key('f', { metaKey: true }))).toBe(true);
    expect(isFindShortcut(key('F', { ctrlKey: true }))).toBe(true);
    expect(isFindShortcut(key('f'))).toBe(false);
    expect(isFindShortcut(key('f', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(findAgainDirection(key('g', { metaKey: true }))).toBe(1);
    expect(findAgainDirection(key('G', { metaKey: true, shiftKey: true }))).toBe(-1);
    expect(findAgainDirection(key('g'))).toBeNull();
  });
});
