import { describe, it, expect } from 'vitest';
import { shareLink } from '../share-link';

const at = (href: string): URL => new URL(href);

describe('shareLink', () => {
  it('links the page, in its notebook, to open in the app', () => {
    expect(shareLink(at('http://127.0.0.1:7369/app/wiki/abc'), 'home')).toBe('http://127.0.0.1:7369/app/wiki/abc?notebook=home&open=app');
  });

  it('keeps what the page has open, and drops a hash', () => {
    expect(shareLink(at('http://127.0.0.1:7369/app/people/p1?doc=d1#notes'), 'work'))
      .toBe('http://127.0.0.1:7369/app/people/p1?doc=d1&notebook=work&open=app');
  });

  it('replaces a notebook already in the query', () => {
    expect(shareLink(at('http://127.0.0.1:7369/app?notebook=old'), 'home')).toBe('http://127.0.0.1:7369/app?notebook=home&open=app');
  });

  it('works on any address, such as a dev server', () => {
    expect(shareLink(at('http://localhost:5173/app/todos?popup=todo&todo=t1'), 'home'))
      .toBe('http://localhost:5173/app/todos?popup=todo&todo=t1&notebook=home&open=app');
  });

  it('keeps a single open=app', () => {
    expect(shareLink(at('http://127.0.0.1:7369/app/goals?open=app'), 'work')).toBe('http://127.0.0.1:7369/app/goals?notebook=work&open=app');
  });

  it('leaves a page outside the app as it is', () => {
    expect(shareLink(at('http://127.0.0.1:7369/files/x.pdf'), 'home')).toBe('http://127.0.0.1:7369/files/x.pdf');
  });

  it('leaves the notebook out when there is none', () => {
    expect(shareLink(at('http://127.0.0.1:7369/app/projects'), null)).toBe('http://127.0.0.1:7369/app/projects?open=app');
  });
});
