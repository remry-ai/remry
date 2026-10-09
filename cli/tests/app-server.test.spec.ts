import { describe, it, expect } from 'vitest';
import { appControl, staticFile } from '../app-server';
import { appLaunchCommand, appUrl, isRemryCommand, parsePids, planAppLaunch } from '../app-launch';

describe('isRemryCommand', () => {
  it('recognises a release binary and a clone’s dev server', () => {
    expect(isRemryCommand('/Users/me/Library/Application Support/Remry/App/0.6.7/remry app')).toBe(true);
    expect(isRemryCommand('node /Users/me/code/remry/node_modules/.bin/vite dev')).toBe(true);
    expect(isRemryCommand('node /Users/me/code/remry-main/node_modules/.bin/vite dev')).toBe(true);
  });

  it('recognises a Windows release binary', () => {
    expect(isRemryCommand('"C:\\Users\\me\\AppData\\Local\\Remry\\App\\0.8.0\\remry.exe" app')).toBe(true);
    expect(isRemryCommand('C:\\Tools\\remry.exe app')).toBe(true);
    expect(isRemryCommand('C:\\Tools\\notremry.exe app')).toBe(false);
  });

  it('recognises an app from before the renames to Remry and Wonos', () => {
    expect(isRemryCommand('/Users/me/Library/Application Support/Wonos/App/0.11.3/wono app')).toBe(true);
    expect(isRemryCommand('C:\\Tools\\wono.exe app')).toBe(true);
    expect(isRemryCommand('node /Users/me/code/wonos/node_modules/.bin/vite dev')).toBe(true);
    expect(isRemryCommand('/Users/me/Library/Application Support/Working Notes/App/0.10.2/wnotes app')).toBe(true);
    expect(isRemryCommand('node /Users/me/code/working-notes/node_modules/.bin/vite dev')).toBe(true);
  });

  it('refuses anything else on the port', () => {
    expect(isRemryCommand('node /Users/me/code/other-app/node_modules/.bin/vite dev')).toBe(false);
    expect(isRemryCommand('')).toBe(false);
  });
});

describe('appControl', () => {
  const stop = (host: string, headers: Record<string, string> = { 'x-remry': '1' }, method = 'POST') =>
    appControl(new Request(`http://${host}/__remry/app/stop`, { method, headers }), '1.2.3');

  it('reports the version', () => {
    expect(appControl(new Request('http://127.0.0.1:5173/__remry/app'), '1.2.3')).toEqual({ kind: 'version', body: { version: '1.2.3' } });
  });

  it('stops only for a loopback POST with the local header', () => {
    expect(stop('127.0.0.1:5173')).toEqual({ kind: 'stop' });
    expect(stop('localhost:5173')).toEqual({ kind: 'stop' });
    expect(stop('evil.example:5173')).toEqual({ kind: 'forbidden' });
    expect(stop('127.0.0.1:5173', {})).toEqual({ kind: 'forbidden' });
    expect(stop('127.0.0.1:5173', { 'x-remry': '1' }, 'GET')).toEqual({ kind: 'forbidden' });
  });

  it('leaves every other request to the app', () => {
    expect(appControl(new Request('http://127.0.0.1:5173/app'), '1.2.3')).toBeNull();
  });
});

describe('planAppLaunch', () => {
  const release = { standalone: true, version: '0.7.0' };

  it('starts when nothing is running', () => {
    expect(planAppLaunch(null, release)).toBe('start');
  });

  it('reuses the same version and restarts a different one', () => {
    expect(planAppLaunch({ version: '0.7.0' }, release)).toBe('reuse');
    expect(planAppLaunch({ version: '0.6.5' }, release)).toBe('restart');
  });

  it('leaves alone what it cannot identify, and a clone never restarts', () => {
    expect(planAppLaunch('other', release)).toBe('reuse');
    expect(planAppLaunch({ version: '0.6.5' }, { standalone: false, version: '0.7.0' })).toBe('reuse');
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

describe('app launch', () => {
  it('runs the release binary, or the clone’s bin/remry', () => {
    expect(appLaunchCommand({ standalone: true, execPath: '/data/App/0.5.0/remry', repoDir: '/repo' })).toEqual({ command: '/data/App/0.5.0/remry', args: ['app'] });
    expect(appLaunchCommand({ standalone: false, execPath: '/opt/homebrew/bin/bun', repoDir: '/repo', platform: 'darwin' })).toEqual({ command: '/repo/bin/remry', args: ['app'] });
    expect(appLaunchCommand({ standalone: false, execPath: 'C:\\bun\\bun.exe', repoDir: 'C:\\repo', platform: 'win32' })).toEqual({ command: 'C:\\bun\\bun.exe', args: ['run', 'dev'], cwd: 'C:\\repo' });
  });

  it('links to a notebook', () => {
    expect(appUrl(null)).toBe('http://127.0.0.1:5173/app');
    expect(appUrl('work-work')).toBe('http://127.0.0.1:5173/app?notebook=work-work');
  });
});

describe('parsePids', () => {
  it('reads one pid per line, from lsof or PowerShell', () => {
    expect(parsePids('123\n456\n')).toEqual([123, 456]);
    expect(parsePids('789\r\n\r\n')).toEqual([789]);
    expect(parsePids('')).toEqual([]);
  });
});
