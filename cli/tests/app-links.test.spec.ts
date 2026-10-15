import { describe, it, expect } from 'vitest';
import { appPageLink, withAppLinks } from '../app-links';

const link = (path: string): string => appPageLink(path, 'home', 7369);

describe('appPageLink', () => {
  it('opens the path through /open, in the notebook', () => {
    expect(link('/app/wiki/abc')).toBe('http://127.0.0.1:7369/open/app/wiki/abc?notebook=home');
  });

  it('keeps a query the path already has', () => {
    expect(link('/app/people/abc?doc=d1')).toBe('http://127.0.0.1:7369/open/app/people/abc?doc=d1&notebook=home');
  });

  it("uses the clone's dev server port", () => {
    expect(appPageLink('/app/projects/p1', 'work', 5173)).toBe('http://127.0.0.1:5173/open/app/projects/p1?notebook=work');
  });
});

describe('withAppLinks', () => {
  it('adds a url right after each app path, at any depth', () => {
    const result = withAppLinks({ ok: true, value: { id: 'abc', path: '/app/wiki/abc', children: [{ id: 'c', path: '/app/wiki/c' }] } }, link);
    expect(result).toEqual({
      ok: true,
      value: {
        id: 'abc',
        path: '/app/wiki/abc',
        url: 'http://127.0.0.1:7369/open/app/wiki/abc?notebook=home',
        children: [{ id: 'c', path: '/app/wiki/c', url: 'http://127.0.0.1:7369/open/app/wiki/c?notebook=home' }]
      }
    });
    expect(Object.keys((result as { value: object }).value)).toEqual(['id', 'path', 'url', 'children']);
  });

  it('leaves other paths, an existing url and non-plain values alone', () => {
    const at = new Date('2026-10-15T00:00:00Z');
    const input = { path: 'notes/a.md', other: { path: '/app/x', url: 'kept' }, at, issues: [{ path: 'title' }] };
    const result = withAppLinks(input, link) as typeof input;
    expect(result).toEqual(input);
    expect(result.at).toBe(at);
  });

  it('passes through values without objects', () => {
    expect(withAppLinks('text', link)).toBe('text');
    expect(withAppLinks(null, link)).toBe(null);
    expect(withAppLinks([1, '/app'], link)).toEqual([1, '/app']);
  });
});
