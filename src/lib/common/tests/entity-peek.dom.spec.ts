// The detail page's side peek, mounted for real with the right panel that draws its content
// (PeekHarness): opening a peek of each type, then leaving it the ways the app does (× removes `?peek=`, Open goes to another page, a row peeks something
// else). 0.16.27 threw here: a peek's props read `target.id` once more while the peek was being
// removed, so the navigation stopped part way (old page or a spinner left showing) and × did
// nothing. Any error during those updates fails this test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get, writable } from 'svelte/store';
import { page, setUrl } from './fake-page.svelte';

vi.mock('$app/state', () => ({ page }));
// The store form, for code that reads it (the notebook model, a work notebook from `data`).
vi.mock('$app/stores', () => ({ page: writable({ get url() { return page.url; }, data: {} }) }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

// Every query answers "not found", except the page kinds a wiki page's peek waits for, so each
// peek renders its header and error and nothing goes to a server.
vi.mock('$shared/trpc/client', () => {
  const call = (path: readonly string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_t, key: string) => (key === 'query' || key === 'mutate'
        ? () => Promise.resolve(path.join('.') === 'pageKind.list' ? { ok: true, value: [] } : { ok: false, error: { message: 'Not found' } })
        : call([...path, key]))
    });
  return { trpc: () => call([]) };
});

const { default: PeekHarness } = await import('./PeekHarness.svelte');
const { rightPanelPeek } = await import('$lib/stores/right-panel');

const PEEKS = ['PROJECT:p1', 'PAGE:w1', 'GOAL:g1', 'PERSON:a1', 'DOC:d1'] as const;

/** Lets the peek's loads settle and their results render. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await tick();
  flushSync();
};

describe('EntityPeek', () => {
  let target: HTMLElement;
  let peek: ReturnType<typeof mount> | null = null;
  const errors: unknown[] = [];
  const onError = (e: ErrorEvent | PromiseRejectionEvent): void => { errors.push('reason' in e ? e.reason : e.error); };

  beforeEach(() => {
    errors.length = 0;
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    setUrl('/app/projects/p0');
    target = document.createElement('div');
    document.body.append(target);
    peek = mount(PeekHarness, { target });
  });

  afterEach(() => {
    if (peek) unmount(peek);
    target.remove();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onError);
  });

  /** Changes the URL as a navigation would, and fails on any error while the page updates. */
  const navigate = async (href: string): Promise<void> => {
    expect(() => { setUrl(href); flushSync(); }, `navigating to ${href}`).not.toThrow();
    await settle();
    expect(errors, `errors after navigating to ${href}`).toEqual([]);
  };

  it.each(PEEKS)('opens %s, and closes it with ×', async (value) => {
    await navigate(`/app/projects/p0?peek=${value}`);
    expect(get(rightPanelPeek)).not.toBeNull();
    expect(target.querySelector('#right-panel')?.textContent).toContain('Not found');

    await navigate('/app/projects/p0');
    expect(get(rightPanelPeek)).toBeNull();
  });

  it.each(PEEKS)('leaves %s for another page with Open', async (value) => {
    await navigate(`/app/projects/p0?peek=${value}`);
    await navigate('/app/projects/p1');
    expect(get(rightPanelPeek)).toBeNull();
  });

  it('peeks one thing after another', async () => {
    for (const value of [...PEEKS, PEEKS[0]]) {
      await navigate(`/app/projects/p0?peek=${value}`);
      expect(get(rightPanelPeek)).not.toBeNull();
    }
    await navigate('/app/projects/p0');
    expect(get(rightPanelPeek)).toBeNull();
  });
});
