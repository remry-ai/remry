import { describe, it, expect } from 'vitest';
import { entityFileFolder, fileLinkKey, fileLinkUrl, linkHref } from '../file-links';

describe('file links', () => {
  it('round-trips a stored file through its link address', () => {
    expect(fileLinkUrl('pages/p1/file-a.csv')).toBe('storage://pages/p1/file-a.csv');
    expect(fileLinkKey('storage://pages/p1/file-a.csv')).toBe('pages/p1/file-a.csv');
    expect(fileLinkKey('https://linear.app/x')).toBeNull();
  });

  it('opens a file link from the files route, and any other link as it is', () => {
    expect(linkHref('storage://docs/d1/file-a.pdf')).toBe('/files/docs/d1/file-a.pdf');
    expect(linkHref('https://linear.app/x')).toBe('https://linear.app/x');
  });

  it('knows the folders docs and pages keep their files in', () => {
    expect(entityFileFolder('DOC', 'd1')).toBe('docs/d1');
    expect(entityFileFolder('PAGE', 'p1')).toBe('pages/p1');
    expect(entityFileFolder('PERSON', 'x')).toBeNull();
  });
});
