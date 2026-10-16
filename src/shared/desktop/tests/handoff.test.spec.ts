import { describe, it, expect } from 'vitest';
import { deepLink, handoffCommand, inAppLink, openInAppRoute, openTarget, withNotebook } from '../handoff';

describe('openTarget', () => {
  it('keeps app pages with their query', () => {
    expect(openTarget('app', '')).toBe('/app');
    expect(openTarget('app/people/abc', '?doc=d1')).toBe('/app/people/abc?doc=d1');
  });

  it('drops open=app, keeping the rest of the query', () => {
    expect(openTarget('app/wiki/w1', '?notebook=home&open=app')).toBe('/app/wiki/w1?notebook=home');
    expect(openTarget('app', '?open=app')).toBe('/app');
  });

  it('refuses anything outside the app', () => {
    expect(openTarget('files/x', '')).toBeNull();
    expect(openTarget('apple', '')).toBeNull();
    expect(openTarget('app/../files/x', '')).toBeNull();
    expect(openTarget('', '')).toBeNull();
  });
});

describe('openInAppRoute', () => {
  const route = (href: string): string | undefined => {
    const url = new URL(href);
    return openInAppRoute(url.pathname, url.searchParams);
  };

  it('sends an app page with open=app to the open route', () => {
    expect(route('http://127.0.0.1:7369/app/wiki/w1?notebook=home&open=app')).toBe('/open/app/wiki/w1');
    expect(route('http://127.0.0.1:7369/app?open=app')).toBe('/open/app');
  });

  it('leaves every other request on its own route', () => {
    expect(route('http://127.0.0.1:7369/app/wiki/w1')).toBeUndefined();
    expect(route('http://127.0.0.1:7369/app/wiki/w1?open=1')).toBeUndefined();
    expect(route('http://127.0.0.1:7369/files/x?open=app')).toBeUndefined();
    expect(route('http://127.0.0.1:7369/apple?open=app')).toBeUndefined();
  });
});

describe('inAppLink', () => {
  it('adds the notebook and open=app last, keeping the query', () => {
    expect(inAppLink('/app/todos?popup=todo&todo=t1', 'work')).toBe('/app/todos?popup=todo&todo=t1&notebook=work&open=app');
    expect(inAppLink('/app?open=app&notebook=old', 'home')).toBe('/app?notebook=home&open=app');
    expect(inAppLink('/app/projects', null)).toBe('/app/projects?open=app');
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
