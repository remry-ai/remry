import { describe, it, expect } from 'vitest';
import { isSyncStale, linkLabel, linkSource } from '../source';

describe('linkSource', () => {
  it('recognises the tools people import from', () => {
    expect(linkSource('https://linear.app/acme/issue/ENG-123/fix')?.name).toBe('Linear');
    expect(linkSource('https://www.notion.so/acme/Roadmap-abc')?.name).toBe('Notion');
    expect(linkSource('https://acme.notion.site/Roadmap-abc')?.name).toBe('Notion');
    expect(linkSource('https://github.com/acme/api/pull/4')?.mark).toBe('GH');
  });

  it('tells hosts that serve several tools apart by path', () => {
    expect(linkSource('https://acme.atlassian.net/browse/ENG-1')?.name).toBe('Jira');
    expect(linkSource('https://acme.atlassian.net/wiki/spaces/ENG')?.name).toBe('Confluence');
    expect(linkSource('https://docs.google.com/spreadsheets/d/x')?.name).toBe('Google Sheets');
    expect(linkSource('https://docs.google.com/document/d/x')?.name).toBe('Google Docs');
  });

  it('returns null for other addresses, and for text that is not a URL', () => {
    expect(linkSource('https://example.com/linear.app')).toBeNull();
    expect(linkSource('https://notlinear.app/x')).toBeNull();
    expect(linkSource('not a url')).toBeNull();
  });
});

describe('linkLabel', () => {
  it('prefers the title, then the host and path', () => {
    expect(linkLabel('Linear: ENG-123', 'https://linear.app/x')).toBe('Linear: ENG-123');
    expect(linkLabel(null, 'https://www.example.com/a/b/')).toBe('example.com/a/b');
    expect(linkLabel('  ', 'https://example.com/')).toBe('example.com');
  });

  it("drops the tool's name from the title when the icon shows it", () => {
    const linear = linkSource('https://linear.app/x');
    expect(linkLabel('Linear: ENG-123', 'https://linear.app/x', linear)).toBe('ENG-123');
    expect(linkLabel('linear - ENG-123', 'https://linear.app/x', linear)).toBe('ENG-123');
    expect(linkLabel('Linear', 'https://linear.app/x', linear)).toBe('Linear');
    expect(linkLabel('Linear roadmap', 'https://linear.app/x', linear)).toBe('Linear roadmap');
  });
});

describe('isSyncStale', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  it('is stale after a week', () => {
    expect(isSyncStale('2026-09-24T12:00:00Z', now)).toBe(false);
    expect(isSyncStale(new Date('2026-09-23T11:00:00Z'), now)).toBe(true);
  });
});
