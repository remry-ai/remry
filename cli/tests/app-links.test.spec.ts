import { describe, it, expect } from 'vitest';
import { appPageLink, withAppLinks } from '../app-links';

const link = (path: string): string => appPageLink(path, 'home', 7369);

describe('appPageLink', () => {
  it('links the page, in the notebook, to open in the app', () => {
    expect(link('/app/wiki/abc')).toBe('http://127.0.0.1:7369/app/wiki/abc?notebook=home&open=app');
  });

  it('keeps a query the path already has', () => {
    expect(link('/app/people/abc?doc=d1')).toBe('http://127.0.0.1:7369/app/people/abc?doc=d1&notebook=home&open=app');
  });

  it("uses the clone's dev server port", () => {
    expect(appPageLink('/app/projects/p1', 'work', 5173)).toBe('http://127.0.0.1:5173/app/projects/p1?notebook=work&open=app');
  });
});

describe('withAppLinks', () => {
  it('adds a url right after the path of the item a tool returns, and not to nested items', () => {
    const result = withAppLinks({ ok: true, value: { id: 'abc', path: '/app/wiki/abc', children: [{ id: 'c', path: '/app/wiki/c' }] } }, link);
    expect(result).toEqual({
      ok: true,
      value: {
        id: 'abc',
        path: '/app/wiki/abc',
        url: 'http://127.0.0.1:7369/app/wiki/abc?notebook=home&open=app',
        children: [{ id: 'c', path: '/app/wiki/c' }]
      }
    });
    expect(Object.keys((result as { value: object }).value)).toEqual(['id', 'path', 'url', 'children']);
  });

  it('leaves the rows of a list with just their path', () => {
    const rows = [{ id: 'a', path: '/app/people/a' }, { id: 'b', path: '/app/people/b' }];
    expect(withAppLinks({ ok: true, value: rows }, link)).toEqual({ ok: true, value: rows });
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
