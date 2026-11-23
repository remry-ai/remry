import { describe, it, expect } from 'vitest';
import { posix, win32 } from 'node:path';
import {
  claudeDesktopConfigPath,
  installModeFor,
  installedBinary,
  resourceDirsFor,
  staleAppFolders,
  unlinkableReason,
  versionFolderOf,
  withMcpServer,
  withoutMcpServer
} from '../desktop-plan';
import { isVersion } from '../../scripts/release/versions';

const mac = { platform: 'darwin' as const, home: '/Users/me', env: {} };
const windows = { platform: 'win32' as const, home: 'C:\\Users\\me', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', APPDATA: 'C:\\Users\\me\\AppData\\Roaming' } };
const linux = { platform: 'linux' as const, home: '/home/me', env: {} };

describe('installedBinary', () => {
  it('points at App/current in the data folder', () => {
    expect(installedBinary(mac)).toBe('/Users/me/Library/Application Support/Remry/App/current/remry');
    expect(installedBinary(windows)).toBe('C:\\Users\\me\\AppData\\Local\\Remry\\App\\current\\remry.exe');
    expect(installedBinary(linux)).toBe('/home/me/.local/share/remry/App/current/remry');
  });
});

describe('claudeDesktopConfigPath', () => {
  it("uses Claude desktop's folder on each system", () => {
    expect(claudeDesktopConfigPath(mac)).toBe('/Users/me/Library/Application Support/Claude/claude_desktop_config.json');
    expect(claudeDesktopConfigPath(windows)).toBe('C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
    expect(claudeDesktopConfigPath(linux)).toBe('/home/me/.config/Claude/claude_desktop_config.json');
  });
});

describe('withMcpServer', () => {
  const entry = { command: '/data/App/current/remry', args: ['mcp'] };

  it('adds the server to a missing or empty config', () => {
    for (const existing of [null, '', '  \n']) {
      const result = withMcpServer(existing, 'remry', entry);
      expect(result.ok && result.value.change).toBe('added');
      expect(result.ok && JSON.parse(result.value.text)).toEqual({ mcpServers: { 'remry': entry } });
    }
  });

  it('keeps other settings and servers', () => {
    const existing = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x', args: [] } } });
    const result = withMcpServer(existing, 'remry', entry);
    expect(result.ok && JSON.parse(result.value.text)).toEqual({
      theme: 'dark',
      mcpServers: { other: { command: 'x', args: [] }, 'remry': entry }
    });
  });

  it('reports whether anything changed', () => {
    const same = JSON.stringify({ mcpServers: { 'remry': entry } });
    const result = withMcpServer(same, 'remry', entry);
    expect(result.ok && result.value.change).toBe('unchanged');
    const moved = withMcpServer(same, 'remry', { command: '/elsewhere/remry', args: ['mcp'] });
    expect(moved.ok && moved.value.change).toBe('updated');
  });

  it('replaces our server from before the rename to Remry, and only ours', () => {
    const ours = JSON.stringify({ mcpServers: { 'working-notes': { command: '/old/App/current/wnotes', args: ['mcp'] }, wonos: { command: '/old/App/current/wono', args: ['mcp'] }, remry: entry } });
    const replaced = withMcpServer(ours, 'remry', entry, ['wonos', 'working-notes']);
    expect(replaced.ok && replaced.value.change).toBe('updated');
    expect(replaced.ok && JSON.parse(replaced.value.text)).toEqual({ mcpServers: { remry: entry } });

    const theirs = JSON.stringify({ mcpServers: { 'working-notes': { command: '/usr/bin/something-else', args: [] } } });
    const kept = withMcpServer(theirs, 'remry', entry, ['wonos', 'working-notes']);
    expect(kept.ok && Object.keys(JSON.parse(kept.value.text).mcpServers)).toEqual(['working-notes', 'remry']);
  });

  it("refuses a config it can't read, rather than overwriting it", () => {
    expect(withMcpServer('{ nope', 'remry', entry).ok).toBe(false);
    expect(withMcpServer('[]', 'remry', entry).ok).toBe(false);
    expect(withMcpServer('{"mcpServers": 3}', 'remry', entry).ok).toBe(false);
  });
});

describe('installModeFor', () => {
  it('links on macOS and copies elsewhere', () => {
    expect(installModeFor('darwin')).toBe('link');
    expect(installModeFor('win32')).toBe('copy');
    expect(installModeFor('linux')).toBe('copy');
  });
});

describe('unlinkableReason', () => {
  it('accepts an installed app', () => {
    expect(unlinkableReason('/Applications/Remry.app/Contents/MacOS/remry')).toBeNull();
    expect(unlinkableReason('/Users/me/Applications/Remry.app/Contents/MacOS/remry')).toBeNull();
  });

  it('refuses a translocated app or one on a disk image, saying to move it to Applications', () => {
    for (const path of [
      '/private/var/folders/xy/abc/T/AppTranslocation/1234-ABCD/d/Remry.app/Contents/MacOS/remry',
      '/Volumes/Remry/Remry.app/Contents/MacOS/remry'
    ]) {
      expect(unlinkableReason(path)).toMatch(/Applications folder/);
    }
  });
});

describe('resourceDirsFor', () => {
  it("looks beside the binary, then in a macOS app's Contents/Resources", () => {
    expect(resourceDirsFor('/Applications/Remry.app/Contents/MacOS')).toEqual([
      '/Applications/Remry.app/Contents/MacOS',
      '/Applications/Remry.app/Contents/Resources'
    ]);
    expect(resourceDirsFor('C:\\Users\\me\\AppData\\Local\\Remry\\App\\0.17.0', win32)[0]).toBe('C:\\Users\\me\\AppData\\Local\\Remry\\App\\0.17.0');
  });
});

describe('versionFolderOf', () => {
  it('names the App/<version> folder a link points at', () => {
    expect(versionFolderOf('0.16.113', '/data/App')).toBe('0.16.113');
    expect(versionFolderOf('/data/App/0.16.113', '/data/App')).toBe('0.16.113');
    expect(versionFolderOf('C:\\data\\App\\0.16.113\\', 'C:\\data\\App', win32)).toBe('0.16.113');
  });

  it("is null for a link into the app, or none", () => {
    expect(versionFolderOf('/Applications/Remry.app/Contents/MacOS', '/data/App', posix)).toBeNull();
    expect(versionFolderOf(null, '/data/App')).toBeNull();
  });
});

describe('staleAppFolders', () => {
  const entries = ['0.16.100', '0.16.112', '0.16.113', 'current', '.install-0.17.0-42', '.current-42'];

  it('keeps the current and previous versions, and anything that is not a version folder', () => {
    expect(staleAppFolders(entries, ['0.16.113', '0.16.112'], isVersion)).toEqual(['0.16.100']);
  });

  it('removes every copy once the app is linked, except the one just replaced', () => {
    expect(staleAppFolders(entries, ['0.16.113'], isVersion)).toEqual(['0.16.100', '0.16.112']);
    expect(staleAppFolders(entries, [null], isVersion)).toEqual(['0.16.100', '0.16.112', '0.16.113']);
  });
});

describe('withoutMcpServer', () => {
  const binary = '/data/App/current/remry';
  const config = (servers: Record<string, unknown>): string => JSON.stringify({ theme: 'dark', mcpServers: servers });

  it('removes our server and keeps everything else', () => {
    const result = withoutMcpServer(config({ remry: { command: binary, args: ['mcp'] }, other: { command: 'x' } }), 'remry', binary);
    expect(result.ok && JSON.parse(result.value ?? 'null')).toEqual({ theme: 'dark', mcpServers: { other: { command: 'x' } } });
  });

  it("leaves a server of that name that runs something else, and a config with none", () => {
    for (const existing of [null, '', config({}), config({ remry: { command: '/elsewhere/remry', args: ['mcp'] } }), '{"theme":"dark"}']) {
      const result = withoutMcpServer(existing, 'remry', binary);
      expect(result.ok && result.value).toBeNull();
    }
  });

  it('refuses a config that is not JSON, saying what to remove by hand', () => {
    const result = withoutMcpServer('{nope', 'remry', binary);
    expect(!result.ok && result.error.message).toMatch(/by hand/);
  });
});
