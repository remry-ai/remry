import { describe, it, expect } from 'vitest';
import { chatGptConfigPath, withChatGptMcpServer, withoutChatGptMcpServer } from '../chatgpt-config';

const entry = { command: '/data/App/current/remry', args: ['mcp'] };
const block = '[mcp_servers.remry]\ncommand = "/data/App/current/remry"\nargs = ["mcp"]\n';

describe('chatGptConfigPath', () => {
  it('is ~/.codex/config.toml, or under CODEX_HOME', () => {
    expect(chatGptConfigPath({ platform: 'darwin', home: '/Users/me', env: {} })).toBe('/Users/me/.codex/config.toml');
    expect(chatGptConfigPath({ platform: 'linux', home: '/home/me', env: { CODEX_HOME: '/srv/codex' } })).toBe('/srv/codex/config.toml');
    expect(chatGptConfigPath({ platform: 'win32', home: 'C:\\Users\\me', env: {} })).toBe('C:\\Users\\me\\.codex\\config.toml');
  });
});

describe('withChatGptMcpServer', () => {
  it('adds the server to a missing or empty config', () => {
    for (const existing of [null, '', '\n']) {
      const result = withChatGptMcpServer(existing, 'remry', entry);
      expect(result.ok && result.value).toEqual({ text: block, change: 'added' });
    }
  });

  it('appends after everything else, keeping comments and other servers', () => {
    const existing = '# my settings\nmodel = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x" # theirs\n';
    const result = withChatGptMcpServer(existing, 'remry', entry);
    expect(result.ok && result.value).toEqual({ text: `${existing}\n${block}`, change: 'added' });
  });

  it('is unchanged when it already runs the binary, however it is quoted', () => {
    for (const existing of [block, "[mcp_servers.remry]\ncommand = '/data/App/current/remry'\nargs = [ 'mcp' ]\n", '[mcp_servers."remry"]\nargs = ["mcp"]\ncommand = "/data/App/current/remry"\n']) {
      const result = withChatGptMcpServer(existing, 'remry', entry);
      expect(result.ok && result.value).toEqual({ text: existing, change: 'unchanged' });
    }
  });

  it('updates command and args and keeps the other keys and subtables', () => {
    const existing = '[mcp_servers.remry]\ncommand = "/old/remry"\nargs = [\n  "mcp",\n]\nstartup_timeout_sec = 30\n\n[mcp_servers.remry.env]\nREMRY_NOTEBOOK = "work"\n\n[other]\na = 1\n';
    const result = withChatGptMcpServer(existing, 'remry', entry);
    expect(result.ok && result.value).toEqual({
      text: '[mcp_servers.remry]\ncommand = "/data/App/current/remry"\nargs = ["mcp"]\nstartup_timeout_sec = 30\n\n[mcp_servers.remry.env]\nREMRY_NOTEBOOK = "work"\n\n[other]\na = 1\n',
      change: 'updated'
    });
  });

  it('writes a Windows path as a valid TOML string and keeps CRLF line ends', () => {
    const result = withChatGptMcpServer('model = "gpt-5"\r\n', 'remry', { command: 'C:\\Users\\me\\remry.exe', args: ['mcp'] });
    expect(result.ok && result.value.text).toBe('model = "gpt-5"\r\n\r\n[mcp_servers.remry]\r\ncommand = "C:\\\\Users\\\\me\\\\remry.exe"\r\nargs = ["mcp"]\r\n');
  });

  it('ignores a header-like line inside a multi-line string', () => {
    const existing = 'notes = """\n[mcp_servers.remry]\n"""\n';
    const result = withChatGptMcpServer(existing, 'remry', entry);
    expect(result.ok && result.value.change).toBe('added');
  });

  it('refuses a server defined as a dotted key or an inline table', () => {
    for (const existing of ['mcp_servers.remry.command = "x"\n', '[mcp_servers]\nremry = { command = "x" }\n']) {
      const result = withChatGptMcpServer(existing, 'remry', entry);
      expect(!result.ok && result.error.message).toMatch(/Remove that entry/);
    }
  });
});

describe('withoutChatGptMcpServer', () => {
  const binary = entry.command;

  it('removes our table and its subtables, keeping everything else', () => {
    const existing = 'model = "gpt-5"\n\n[mcp_servers.remry]\ncommand = "/data/App/current/remry"\nargs = ["mcp"]\n\n[mcp_servers.remry.env]\nA = "1"\n\n[mcp_servers.other]\ncommand = "x"\n';
    const result = withoutChatGptMcpServer(existing, 'remry', binary);
    expect(result.ok && result.value).toBe('model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n');
  });

  it('leaves a server of that name that runs something else, and a config with none', () => {
    for (const existing of [null, '', 'model = "gpt-5"\n', '[mcp_servers.remry]\ncommand = "/elsewhere/remry"\n']) {
      const result = withoutChatGptMcpServer(existing, 'remry', binary);
      expect(result.ok && result.value).toBeNull();
    }
  });

  it('empties a config that held only our server', () => {
    const result = withoutChatGptMcpServer(block, 'remry', binary);
    expect(result.ok && result.value).toBe('');
  });
});
