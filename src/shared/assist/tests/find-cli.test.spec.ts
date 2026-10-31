import { describe, it, expect } from 'vitest';
import { cmdCommandLine, findExecutable } from '../find-cli';

const only = (...paths: string[]) => (path: string): boolean => paths.includes(path);

describe('findExecutable', () => {
  it('finds a CLI on PATH, then where installers put it, on macOS and Linux', () => {
    expect(findExecutable('copilot', { PATH: '/usr/bin:/a/bin' }, 'posix', only('/a/bin/copilot'))).toBe('/a/bin/copilot');
    expect(findExecutable('copilot', { HOME: '/Users/me' }, 'posix', only('/Users/me/.npm-global/bin/copilot'))).toBe('/Users/me/.npm-global/bin/copilot');
    expect(findExecutable('claude', { HOME: '/Users/me' }, 'posix', only('/Users/me/.claude/local/claude'))).toBe('/Users/me/.claude/local/claude');
    expect(findExecutable('copilot', { PATH: '/usr/bin' }, 'posix', () => false)).toBeNull();
  });

  it('on Windows splits PATH on ; and finds the .exe or npm\'s .cmd', () => {
    expect(findExecutable('copilot', { PATH: 'C:\\Windows;C:\\Tools\\' }, 'win32', only('C:\\Tools\\copilot.cmd'))).toBe('C:\\Tools\\copilot.cmd');
    expect(findExecutable('claude', { PATH: 'C:\\Tools' }, 'win32', only('C:\\Tools\\claude.exe', 'C:\\Tools\\claude.cmd'))).toBe('C:\\Tools\\claude.exe');
    // Never a bare name without an extension.
    expect(findExecutable('copilot', { PATH: 'C:\\Tools' }, 'win32', only('C:\\Tools\\copilot'))).toBeNull();
  });

  it('on Windows falls back to npm\'s, winget\'s and the user\'s bin folders', () => {
    const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', USERPROFILE: 'C:\\Users\\me' };
    expect(findExecutable('copilot', env, 'win32', only('C:\\Users\\me\\AppData\\Roaming\\npm\\copilot.cmd'))).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\copilot.cmd');
    expect(findExecutable('copilot', env, 'win32', only('C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\copilot.exe'))).toBe('C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\copilot.exe');
    expect(findExecutable('claude', env, 'win32', only('C:\\Users\\me\\.local\\bin\\claude.exe'))).toBe('C:\\Users\\me\\.local\\bin\\claude.exe');
  });
});

describe('cmdCommandLine', () => {
  it('quotes every argument for cmd.exe /s /c', () => {
    expect(cmdCommandLine('C:\\npm\\copilot.cmd', ['-p', 'Read the file', '--deny-tool', 'shell'])).toBe(
      '""C:\\npm\\copilot.cmd" "-p" "Read the file" "--deny-tool" "shell""'
    );
  });

  it('refuses what cmd would expand or split: quotes, % and line breaks', () => {
    expect(cmdCommandLine('a.cmd', ['say "hi"'])).toBeNull();
    expect(cmdCommandLine('a.cmd', ['%PATH%'])).toBeNull();
    expect(cmdCommandLine('a.cmd', ['two\nlines'])).toBeNull();
  });
});
