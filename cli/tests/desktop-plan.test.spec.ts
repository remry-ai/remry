import { describe, it, expect } from 'vitest';
import { claudeDesktopConfigPath, installedBinary, withMcpServer } from '../desktop-plan';

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
