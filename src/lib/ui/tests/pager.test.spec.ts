import { describe, it, expect } from 'vitest';
import { clampPage, pageCount, parsePageParam } from '../pager';

describe('parsePageParam', () => {
  it('reads a whole page number and falls back to page 1', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('-2')).toBe(1);
    expect(parsePageParam('1.5')).toBe(1);
    expect(parsePageParam('two')).toBe(1);
  });
});

describe('pageCount', () => {
  it('rounds up and never goes below one page', () => {
    expect(pageCount(0, 15)).toBe(1);
    expect(pageCount(15, 15)).toBe(1);
    expect(pageCount(16, 15)).toBe(2);
  });
});

describe('clampPage', () => {
  it('keeps a page in range and moves one past the end to the last page', () => {
    expect(clampPage(2, 40, 15)).toBe(2);
    expect(clampPage(9, 40, 15)).toBe(3);
    expect(clampPage(4, 0, 15)).toBe(1);
  });
});
