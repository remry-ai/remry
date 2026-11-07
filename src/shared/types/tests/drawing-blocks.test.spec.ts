import { describe, it, expect } from 'vitest';
import { drawingBlock, drawingBlockPageId, extractDrawingBlocks } from '../drawing-blocks';

describe('drawingBlockPageId', () => {
  it('reads a page path, a full link to one, or a bare id', () => {
    expect(drawingBlockPageId('/app/wiki/cm1abcdefgh')).toBe('cm1abcdefgh');
    expect(drawingBlockPageId('  http://127.0.0.1:7369/app/wiki/cm1abcdefgh \n')).toBe('cm1abcdefgh');
    expect(drawingBlockPageId('cm1abcdefgh')).toBe('cm1abcdefgh');
  });

  it("refuses anything that isn't one page", () => {
    expect(drawingBlockPageId('/app/projects/cm1abcdefgh')).toBeNull();
    expect(drawingBlockPageId('a b')).toBeNull();
    expect(drawingBlockPageId('cm1abcdefgh\ncm1abcdefgh')).toBeNull();
    expect(drawingBlockPageId('')).toBeNull();
  });
});

describe('extractDrawingBlocks', () => {
  it('finds drawing blocks with their opening line, and nothing else', () => {
    const markdown = ['# Plan', '', drawingBlock('cm1abcdefgh'), '', '```js', 'drawing', '```', '~~~drawing', 'oops', '~~~'].join('\n');
    expect(extractDrawingBlocks(markdown)).toEqual([
      { line: 3, source: '/app/wiki/cm1abcdefgh', pageId: 'cm1abcdefgh' },
      { line: 10, source: 'oops', pageId: null }
    ]);
  });
});
