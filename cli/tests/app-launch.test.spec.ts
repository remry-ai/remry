import { describe, it, expect } from 'vitest';
import { appLaunchCommand, appLinkUrl, appUrl, isRemryCommand, parsePids, planAppLaunch } from '../app-launch';

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

describe('planAppLaunch', () => {
  const release = { standalone: true, version: '0.7.0' };

  it('starts when nothing is running', () => {
    expect(planAppLaunch(null, release)).toBe('start');
  });

  it('reuses the same version and restarts an older one', () => {
    expect(planAppLaunch({ version: '0.7.0' }, release)).toBe('reuse');
    expect(planAppLaunch({ version: '0.6.5' }, release)).toBe('restart');
    expect(planAppLaunch({ version: '0.6.10' }, { standalone: true, version: '0.6.9' })).toBe('reuse');
  });

  it('never replaces a newer app with its own older one', () => {
    // A Claude session started before an update still runs the old binary.
    expect(planAppLaunch({ version: '0.16.18' }, { standalone: true, version: '0.16.4' })).toBe('reuse');
    expect(planAppLaunch({ version: '0.8.0' }, release)).toBe('reuse');
  });

  it('leaves alone what it cannot identify, and a clone never restarts', () => {
    expect(planAppLaunch('other', release)).toBe('reuse');
    expect(planAppLaunch({ version: '0.6.5' }, { standalone: false, version: '0.7.0' })).toBe('reuse');
  });
});

describe('app launch', () => {
  it('runs the release binary, or the clone’s bin/remry', () => {
    expect(appLaunchCommand({ standalone: true, execPath: '/data/App/0.5.0/remry', repoDir: '/repo' })).toEqual({ command: '/data/App/0.5.0/remry', args: ['app'] });
    expect(appLaunchCommand({ standalone: false, execPath: '/opt/homebrew/bin/bun', repoDir: '/repo', platform: 'darwin' })).toEqual({ command: '/repo/bin/remry', args: ['app'] });
    expect(appLaunchCommand({ standalone: false, execPath: 'C:\\bun\\bun.exe', repoDir: 'C:\\repo', platform: 'win32' })).toEqual({ command: 'C:\\bun\\bun.exe', args: ['run', 'dev'], cwd: 'C:\\repo' });
  });

  it('links to a notebook', () => {
    expect(appUrl(null)).toBe('http://127.0.0.1:7369/app');
    expect(appUrl('work-work')).toBe('http://127.0.0.1:7369/app?notebook=work-work');
    expect(appUrl('work-work', 5173)).toBe('http://127.0.0.1:5173/app?notebook=work-work');
    expect(appLinkUrl('work-work')).toBe('http://127.0.0.1:7369/app?notebook=work-work&open=app');
    expect(appLinkUrl(null, 5173)).toBe('http://127.0.0.1:5173/app?open=app');
  });
});

describe('parsePids', () => {
  it('reads one pid per line, from lsof or PowerShell', () => {
    expect(parsePids('123\n456\n')).toEqual([123, 456]);
    expect(parsePids('789\r\n\r\n')).toEqual([789]);
    expect(parsePids('')).toEqual([]);
  });
});
