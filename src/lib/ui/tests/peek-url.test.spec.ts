import { describe, expect, it } from 'vitest';
import { peekHref, parsePeek, peekValue } from '../peek-url';

describe('peekHref', () => {
  const base = 'http://127.0.0.1:7369';

  it('sets the peek', () => {
    expect(peekHref(new URL(`${base}/app/projects`), 'p1')).toBe('/app/projects?peek=p1');
  });

  it('replaces an open peek', () => {
    expect(peekHref(new URL(`${base}/app/projects?peek=p1`), 'p2')).toBe('/app/projects?peek=p2');
  });

  it('removes the peek', () => {
    expect(peekHref(new URL(`${base}/app/projects?peek=p1`), null)).toBe('/app/projects');
  });

  it('keeps every other param', () => {
    const url = new URL(`${base}/app/projects?team=t1&group=team&archived=all`);
    expect(peekHref(url, 'p1')).toBe('/app/projects?team=t1&group=team&archived=all&peek=p1');
    expect(peekHref(new URL(`${base}/app/projects?team=t1&peek=p1&group=team`), null)).toBe('/app/projects?team=t1&group=team');
  });

  it('takes another param name', () => {
    expect(peekHref(new URL(`${base}/app/people`), 'x', 'person')).toBe('/app/people?person=x');
  });
});

describe('parsePeek', () => {
  it("reads a list page's plain id", () => {
    expect(parsePeek('abc')).toEqual({ type: null, id: 'abc' });
  });

  it("reads a detail page's typed value", () => {
    expect(parsePeek(peekValue('PROJECT', 'p1'))).toEqual({ type: 'PROJECT', id: 'p1' });
    expect(parsePeek('DOC:d1')).toEqual({ type: 'DOC', id: 'd1' });
  });

  it('keeps an unknown prefix as part of the id, and gives nothing for an empty value', () => {
    expect(parsePeek('NOTE:n1')).toEqual({ type: null, id: 'NOTE:n1' });
    expect(parsePeek('PAGE:')).toBeNull();
    expect(parsePeek('')).toBeNull();
    expect(parsePeek(null)).toBeNull();
  });
});
