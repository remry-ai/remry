import { describe, it, expect } from 'vitest';
import { deepLink, handoffCommand, openTarget, withNotebook } from '../handoff';

describe('openTarget', () => {
  it('keeps app pages with their query', () => {
    expect(openTarget('app', '')).toBe('/app');
    expect(openTarget('app/people/abc', '?doc=d1')).toBe('/app/people/abc?doc=d1');
  });

  it('refuses anything outside the app', () => {
    expect(openTarget('files/x', '')).toBeNull();
    expect(openTarget('apple', '')).toBeNull();
    expect(openTarget('app/../files/x', '')).toBeNull();
    expect(openTarget('', '')).toBeNull();
  });
});

describe('withNotebook', () => {
  it('sets the notebook, keeping the rest of the query', () => {
    expect(withNotebook('/app/todos?popup=todo&todo=t1', 'work')).toBe('/app/todos?popup=todo&todo=t1&notebook=work');
    expect(withNotebook('/app/people/a?notebook=home', 'work')).toBe('/app/people/a?notebook=work');
  });
});

describe('handoffCommand', () => {
  const link = deepLink('/app/people/a?notebook=work');
  const host = { platform: 'darwin' as const, standalone: true, desktopInstalled: true };

  it('builds the deep link', () => {
    expect(link).toBe('remry://open/app/people/a?notebook=work');
  });

  it('opens it with the system on macOS and Windows', () => {
    expect(handoffCommand(link, host)).toEqual(['open', link]);
    expect(handoffCommand(link, { ...host, platform: 'win32' })).toEqual(['rundll32', 'url.dll,FileProtocolHandler', link]);
  });

  it('leaves the link in the browser without a release server and the desktop app', () => {
    expect(handoffCommand(link, { ...host, standalone: false })).toBeNull();
    expect(handoffCommand(link, { ...host, desktopInstalled: false })).toBeNull();
    expect(handoffCommand(link, { ...host, platform: 'linux' })).toBeNull();
  });
});
