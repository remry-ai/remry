import { describe, it, expect } from 'vitest';
import { fileUrl, isReadableSourceKey } from '../files';

describe('isReadableSourceKey', () => {
  it('is true for a source- file (a PDF, an image or text) and false for any other', () => {
    expect(isReadableSourceKey('docs/d1/source-abc.pdf')).toBe(true);
    expect(isReadableSourceKey('docs/d1/source-abc.csv')).toBe(true);
    expect(isReadableSourceKey('docs/d1/file-abc.docx')).toBe(false);
    expect(isReadableSourceKey(null)).toBe(false);
    expect(isReadableSourceKey(undefined)).toBe(false);
  });
});

describe('fileUrl', () => {
  it('encodes each part of the key', () => {
    expect(fileUrl('docs/d 1/source-a.pdf')).toBe('/files/docs/d%201/source-a.pdf');
  });
});
