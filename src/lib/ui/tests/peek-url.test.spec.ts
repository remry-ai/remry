import { describe, expect, it } from 'vitest';
import { peekForHref, peekHref, parsePeek, peekValue } from '../peek-url';

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

describe('peekForHref', () => {
  it('reads the type and id from an entity page', () => {
    expect(peekForHref('/app/projects/p1')).toEqual({ type: 'PROJECT', id: 'p1' });
    expect(peekForHref('/app/wiki/w1')).toEqual({ type: 'PAGE', id: 'w1' });
    expect(peekForHref('/app/goals/g1')).toEqual({ type: 'GOAL', id: 'g1' });
    expect(peekForHref('/app/people/a')).toEqual({ type: 'PERSON', id: 'a' });
  });

  it('peeks at the doc in a doc link, on any entity', () => {
    expect(peekForHref('/app/groups/t1?doc=d1')).toEqual({ type: 'DOC', id: 'd1' });
    expect(peekForHref('?doc=d2')).toEqual({ type: 'DOC', id: 'd2' });
  });

  it('gives nothing for what has no peek', () => {
    expect(peekForHref('/app/groups/t1')).toBeNull();
    expect(peekForHref('/app/projects')).toBeNull();
    expect(peekForHref('/app/wiki/kinds')).toBeNull();
    expect(peekForHref('/app/projects/p1/print')).toBeNull();
    expect(peekForHref('?doc=new')).toBeNull();
    expect(peekForHref('https://linear.app/x/issue/1')).toBeNull();
  });
});
