import { describe, it, expect } from 'vitest';
import { CHAT_LIMITS, buildChatArgs, buildClaudeArgs, chatPrompt, findClaude, parseChatOutput, parseClaudeOutput } from '../claude-cli';

const only = (...paths: string[]) => (path: string): boolean => paths.includes(path);

describe('findClaude', () => {
  it('prefers claude on PATH over the install locations', () => {
    const found = findClaude(
      { PATH: '/usr/bin:/custom/bin/', HOME: '/Users/me' },
      only('/custom/bin/claude', '/opt/homebrew/bin/claude')
    );
    expect(found).toBe('/custom/bin/claude');
  });

  it('falls back to where installers put it when PATH is minimal', () => {
    expect(findClaude({ PATH: '/usr/bin:/bin', HOME: '/Users/me' }, only('/Users/me/.local/bin/claude'))).toBe(
      '/Users/me/.local/bin/claude'
    );
    expect(findClaude({}, only('/opt/homebrew/bin/claude'))).toBe('/opt/homebrew/bin/claude');
  });

  it('returns null when claude is nowhere', () => {
    expect(findClaude({ PATH: '/usr/bin', HOME: '/Users/me' }, () => false)).toBeNull();
  });
});

describe('buildClaudeArgs', () => {
  it('runs headless with only the Read tool and no user settings or MCP servers', () => {
    const args = buildClaudeArgs('source-1.pdf');
    expect(args[0]).toBe('-p');
    expect(args[1]).toContain('./source-1.pdf');
    expect(args.slice(2)).toEqual([
      '--output-format', 'json',
      '--tools', 'Read',
      '--allowedTools', 'Read',
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources', ''
    ]);
  });
});

describe('parseClaudeOutput', () => {
  const reply = (fields: Record<string, unknown>): string =>
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...fields });

  it('returns the markdown, without a wrapping code fence', () => {
    expect(parseClaudeOutput(reply({ result: '# Title\n\nBody' }))).toEqual({ ok: true, value: '# Title\n\nBody' });
    expect(parseClaudeOutput(reply({ result: '```markdown\n# Title\n```' }))).toEqual({ ok: true, value: '# Title' });
  });

  it("passes on Claude's own error, such as an expired sign-in", () => {
    const result = parseClaudeOutput(reply({ is_error: true, result: 'Failed to authenticate: OAuth session expired' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("Claude couldn't convert the PDF: Failed to authenticate: OAuth session expired");
  });

  it('rejects output that is not JSON, or has no markdown', () => {
    expect(parseClaudeOutput('Error: boom').ok).toBe(false);
    expect(parseClaudeOutput(reply({ result: '   ' })).ok).toBe(false);
  });
});

describe('chatPrompt', () => {
  it('holds the page and the whole conversation', () => {
    const prompt = chatPrompt({
      entityType: 'PERSON',
      entityName: 'Alice',
      pageText: 'Staff Engineer',
      messages: [
        { role: 'user', content: 'Who is this?' },
        { role: 'assistant', content: 'Alice.' },
        { role: 'user', content: 'Role?' }
      ]
    });
    expect(prompt).toContain('the person "Alice"');
    expect(prompt).toContain('<page>\nStaff Engineer\n</page>');
    expect(prompt).toContain('<user>\nWho is this?\n</user>\n<assistant>\nAlice.\n</assistant>\n<user>\nRole?\n</user>');
  });

  it('cuts off a very long page', () => {
    const prompt = chatPrompt({ entityType: 'PAGE', entityName: 'Big', pageText: 'x'.repeat(CHAT_LIMITS.pageText + 10), messages: [] });
    expect(prompt).toContain('[… the rest of the page was cut off]');
    expect(prompt).not.toContain('x'.repeat(CHAT_LIMITS.pageText + 1));
  });
});

describe('buildChatArgs', () => {
  it('takes the prompt on stdin and allows no tools', () => {
    expect(buildChatArgs()).toEqual([
      '-p',
      '--output-format', 'json',
      '--tools', '',
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--setting-sources', ''
    ]);
  });
});

describe('parseChatOutput', () => {
  const reply = (fields: Record<string, unknown>): string =>
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...fields });

  it('returns the reply as written, code fences included', () => {
    expect(parseChatOutput(reply({ result: '```ts\nx\n```' }))).toEqual({ ok: true, value: '```ts\nx\n```' });
  });

  it("passes on Claude's error and rejects an empty or non-JSON reply", () => {
    const failed = parseChatOutput(reply({ is_error: true, result: 'OAuth session expired' }));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.message).toBe("Claude couldn't reply: OAuth session expired");
    expect(parseChatOutput(reply({ result: ' ' })).ok).toBe(false);
    expect(parseChatOutput('nope').ok).toBe(false);
  });
});
