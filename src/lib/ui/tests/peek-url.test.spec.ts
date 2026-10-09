import { describe, expect, it } from 'vitest';
import { peekHref } from '../peek-url';

describe('peekHref', () => {
  const base = 'http://127.0.0.1:5173';

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
