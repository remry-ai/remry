// The Pro icon beside a locked control, and a menu item marked Pro with its hint, mounted for real.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { page, setData } from './fake-app-page.svelte';

vi.mock('$app/state', () => ({ page }));

const { default: ProIcon } = await import('../ProIcon.svelte');
const { default: Menu } = await import('../Menu.svelte');

const ACTIVE = { state: 'active', licensee: { name: 'Dana', email: 'd@x' }, expires: '2099-01-01', daysLeft: 9000, problem: null };
const NONE = { state: 'none', licensee: null, expires: null, daysLeft: null, problem: null };
const EXPIRED = { state: 'expired', licensee: { name: 'Dana', email: 'd@x' }, expires: '2020-01-01', daysLeft: -10, problem: null };

let mounted: Record<string, unknown> | null = null;
const render = (component: typeof ProIcon | typeof Menu, props: Record<string, unknown> = {}): HTMLElement => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(component as never, { target, props: props as never });
  flushSync();
  return target;
};

afterEach(() => {
  if (mounted) unmount(mounted);
  mounted = null;
  document.body.innerHTML = '';
});

describe('ProIcon', () => {
  it('shows without a license, and with an expired one, named for screen readers', () => {
    setData({ license: NONE });
    const target = render(ProIcon);
    const icon = target.querySelector('.pro-icon');
    expect(icon?.getAttribute('role')).toBe('img');
    expect(icon?.getAttribute('aria-label')).toBe('Part of Remry Pro');
    expect(icon?.getAttribute('title')).toBe('Part of Remry Pro');
    expect(icon?.querySelector('svg')).not.toBeNull();
    unmount(mounted!);
    setData({ license: EXPIRED });
    expect(render(ProIcon).querySelector('.pro-icon')).not.toBeNull();
  });

  it('hides with an active license, and while the layout has no license loaded', () => {
    setData({ license: ACTIVE });
    expect(render(ProIcon).querySelector('.pro-icon')).toBeNull();
    unmount(mounted!);
    setData({});
    expect(render(ProIcon).querySelector('.pro-icon')).toBeNull();
  });

  it('follows `show` over the license, with its own label', () => {
    setData({ license: ACTIVE });
    const target = render(ProIcon, { show: true, label: 'Remry Pro' });
    expect(target.querySelector('.pro-icon')?.getAttribute('aria-label')).toBe('Remry Pro');
    unmount(mounted!);
    setData({ license: NONE });
    expect(render(ProIcon, { show: false }).querySelector('.pro-icon')).toBeNull();
  });

  it('follows the license as it changes (a key added on the License page)', () => {
    setData({ license: NONE });
    const target = render(ProIcon);
    expect(target.querySelector('.pro-icon')).not.toBeNull();
    setData({ license: ACTIVE });
    flushSync();
    expect(target.querySelector('.pro-icon')).toBeNull();
  });
});

describe('Menu items marked Pro', () => {
  it('puts the icon after the label and the hint at the end, only where asked', () => {
    setData({ license: ACTIVE });
    const target = render(Menu, {
      label: 'Add doc',
      items: [
        { label: 'Document', onSelect: () => undefined },
        { label: 'Drawing', onSelect: () => undefined, hint: '3 of 3 free', pro: true }
      ]
    });
    target.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
    flushSync();
    const [doc, drawing] = [...target.querySelectorAll('.menu-item')];
    expect(doc?.querySelector('.pro-icon')).toBeNull();
    expect(doc?.querySelector('.menu-hint')).toBeNull();
    expect(drawing?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Drawing 3 of 3 free');
    // The item's marks follow its label, in order: label, icon, hint.
    const parts = [...drawing!.children].map((el) => el.className.split(' ')[0]);
    expect(parts.slice(-3)).toEqual(['truncate', 'pro-icon', 'menu-hint']);
  });
});
