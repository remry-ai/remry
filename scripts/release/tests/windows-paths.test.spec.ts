import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { windowsUnsafePaths } from '../windows-paths';

describe('windowsUnsafePaths', () => {
  it('finds reserved device names in any segment, with or without an extension', () => {
    expect(windowsUnsafePaths(['src/api/aux/comment/operations.ts', 'docs/NUL.md', 'a/com1.txt', 'src/api/attached/doc.ts', 'auxiliary/x.ts']))
      .toEqual(['src/api/aux/comment/operations.ts', 'docs/NUL.md', 'a/com1.txt']);
  });

  it("finds characters Windows refuses, and names ending in a dot or space", () => {
    expect(windowsUnsafePaths(['a/what?.md', 'b/x:y.ts', 'c/trailing.', 'd/ok.ts'])).toEqual(['a/what?.md', 'b/x:y.ts', 'c/trailing.']);
  });

  it('passes every file in this repository, so Windows can check it out', () => {
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(windowsUnsafePaths(files)).toEqual([]);
  });
});
