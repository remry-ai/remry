import { describe, it, expect } from 'vitest';
import { appControl, staticFile } from '../app-server';

describe('appControl', () => {
  const stop = (host: string, headers: Record<string, string> = { 'x-remry': '1' }, method = 'POST') =>
    appControl(new Request(`http://${host}/__remry/app/stop`, { method, headers }), '1.2.3');

  it('reports the version', () => {
    expect(appControl(new Request('http://127.0.0.1:7369/__remry/app'), '1.2.3')).toEqual({ kind: 'version', body: { version: '1.2.3' } });
  });

  it('stops only for a loopback POST with the local header', () => {
    expect(stop('127.0.0.1:7369')).toEqual({ kind: 'stop' });
    expect(stop('localhost:7369')).toEqual({ kind: 'stop' });
    expect(stop('evil.example:7369')).toEqual({ kind: 'forbidden' });
    expect(stop('127.0.0.1:7369', {})).toEqual({ kind: 'forbidden' });
    expect(stop('127.0.0.1:7369', { 'x-remry': '1' }, 'GET')).toEqual({ kind: 'forbidden' });
  });

  it('leaves every other request to the app', () => {
    expect(appControl(new Request('http://127.0.0.1:7369/app'), '1.2.3')).toBeNull();
  });
});

describe('staticFile', () => {
  const files = new Map([
    ['/_app/immutable/entry/start.js', '/$bunfs/root/start-a1.js'],
    ['/favicon copy.png', '/$bunfs/root/favicon copy-b2.png']
  ]);

  it('finds the embedded file a request path names', () => {
    expect(staticFile(files, '/_app/immutable/entry/start.js')).toBe('/$bunfs/root/start-a1.js');
    expect(staticFile(files, '/favicon%20copy.png')).toBe('/$bunfs/root/favicon copy-b2.png');
  });

  it('refuses anything that isn’t an embedded file, and malformed paths', () => {
    for (const path of ['/', '/../secret', '/%2e%2e/secret', '/_app/../_app/immutable/entry/start.js', '/%E0%A4%A', '/a%00b']) {
      expect(staticFile(files, path)).toBeNull();
    }
  });
});
