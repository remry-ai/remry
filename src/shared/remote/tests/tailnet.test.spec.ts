import { describe, it, expect } from 'vitest';
import { allowRequest, isTailnetHostname, opensToOtherDevices, parseTailnetHost, storedTailnetHost } from '../tailnet';

const API = { basePath: '/api/trpc', localHeader: 'x-remry' };
const HOST = 'my-mac.tail1234.ts.net';

const request = (hostname: string, pathname = '/app', headers: Record<string, string> = {}) => ({
  hostname,
  pathname,
  header: (name: string) => headers[name] ?? null
});

describe('parseTailnetHost', () => {
  it('takes a MagicDNS name or the address tailscale serve prints', () => {
    expect(parseTailnetHost(HOST)).toBe(HOST);
    expect(parseTailnetHost(' My-Mac.Tail1234.ts.net ')).toBe(HOST);
    expect(parseTailnetHost(`https://${HOST}/`)).toBe(HOST);
    expect(parseTailnetHost(`https://${HOST}/app?x=1`)).toBe(HOST);
  });

  it('refuses anything that is not a full tailnet name', () => {
    for (const input of ['', 'my-mac', 'ts.net', 'tail1234.ts.net', 'example.com', 'my-mac.tail1234.ts.net.evil.com', 'evil.com/my-mac.tail1234.ts.net', '100.64.0.1', 'localhost', 'a..b.ts.net']) {
      expect(parseTailnetHost(input), input).toBeNull();
    }
  });
});

describe('storedTailnetHost', () => {
  it('reads only a valid name', () => {
    expect(storedTailnetHost(HOST)).toBe(HOST);
    expect(storedTailnetHost('example.com')).toBeNull();
    expect(storedTailnetHost(42)).toBeNull();
    expect(storedTailnetHost(undefined)).toBeNull();
    expect(isTailnetHostname('MY-MAC.tail1234.ts.net')).toBe(false);
  });
});

describe('allowRequest', () => {
  it('keeps the loopback rules whether or not tailnet access is on', () => {
    for (const host of [null, HOST]) {
      expect(allowRequest(request('127.0.0.1'), host, API)).toBe(true);
      expect(allowRequest(request('localhost', '/api/trpc/person.list', { 'x-remry': '1' }), host, API)).toBe(true);
      expect(allowRequest(request('localhost', '/api/trpc/person.list'), host, API)).toBe(false);
    }
  });

  it('refuses every other hostname while tailnet access is off', () => {
    expect(allowRequest(request(HOST), null, API)).toBe(false);
    expect(allowRequest(request('evil.example'), null, API)).toBe(false);
  });

  it('lets in only the tailnet name that was set', () => {
    expect(allowRequest(request(HOST), HOST, API)).toBe(true);
    expect(allowRequest(request('other.tail1234.ts.net'), HOST, API)).toBe(false);
    expect(allowRequest(request('evil.example'), HOST, API)).toBe(false);
    expect(allowRequest(request('192.168.1.5'), HOST, API)).toBe(false);
  });

  it('still requires the local header on the API', () => {
    expect(allowRequest(request(HOST, '/api/trpc/person.list', { 'x-remry': '1' }), HOST, API)).toBe(true);
    expect(allowRequest(request(HOST, '/api/trpc/person.list'), HOST, API)).toBe(false);
  });

  it('refuses Funnel traffic from the internet', () => {
    expect(allowRequest(request(HOST, '/app', { 'tailscale-funnel-request': '?1' }), HOST, API)).toBe(false);
  });
});

describe('opensToOtherDevices', () => {
  it('is true for sharing on the tailnet or setting a tailnet name: the Pro part', () => {
    expect(opensToOtherDevices({ tailscale: true })).toBe(true);
    expect(opensToOtherDevices({ hostname: 'mac.tail1234.ts.net' })).toBe(true);
    expect(opensToOtherDevices({ tailscale: true, startAtLogin: false })).toBe(true);
  });

  it('is false for turning it off and for starting at login, which stay free', () => {
    expect(opensToOtherDevices({ tailscale: false })).toBe(false);
    expect(opensToOtherDevices({ hostname: null })).toBe(false);
    expect(opensToOtherDevices({ startAtLogin: true })).toBe(false);
    expect(opensToOtherDevices({ startAtLogin: false, tailscale: false })).toBe(false);
    expect(opensToOtherDevices({})).toBe(false);
  });
});
