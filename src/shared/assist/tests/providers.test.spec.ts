import { describe, it, expect } from 'vitest';
import { claudeProvider } from '../providers/claude';
import { COPILOT_PROMPT, buildCopilotArgs, copilotProvider, linkHosts, parseCopilotOutput } from '../providers/copilot';
import { PROMPT_DIR, notFoundWarning } from '../providers/provider';
import { LLM_PROVIDERS, llmProvider } from '../providers/registry';
import { buildChatArgs, buildClaudeArgs } from '../claude-cli';
import { buildSyncArgs } from '../sync-cli';
import { choiceStatus, lookupFrom } from '../llm-choice';

describe('claudeProvider', () => {
  it('runs claude as before: the file prompt as an argument, chat and sync on stdin', () => {
    expect(claudeProvider.invocation({ kind: 'convert', fileName: 'a.pdf' })).toEqual({ args: buildClaudeArgs('a.pdf') });
    expect(claudeProvider.invocation({ kind: 'chat', prompt: 'hi' })).toEqual({ args: buildChatArgs(), stdin: 'hi' });
    expect(claudeProvider.invocation({ kind: 'sync', prompt: 'p', servers: ['Notion'], hosts: [] })).toEqual({ args: buildSyncArgs(['Notion']), stdin: 'p' });
  });
});

describe('copilotProvider', () => {
  it('puts every prompt in a file and only a short pointer on the command line', () => {
    const chat = copilotProvider.invocation({ kind: 'chat', prompt: 'x'.repeat(100_000) });
    expect(chat.promptFile).toHaveLength(100_000);
    expect(chat.stdin).toBeUndefined();
    expect(chat.args.join(' ').length).toBeLessThan(1000);
    expect(chat.args.slice(0, 2)).toEqual(['-p', COPILOT_PROMPT]);
    expect(COPILOT_PROMPT).toContain(PROMPT_DIR);
    expect(copilotProvider.invocation({ kind: 'convert', fileName: 'scan.pdf' }).promptFile).toContain('./scan.pdf');
  });

  it('denies shell commands and writes, turns off GitHub\'s MCP server, and lets a sync fetch only its links\' hosts', () => {
    const args = buildCopilotArgs({ kind: 'sync', prompt: 'p', servers: [], hosts: ['notion.so', 'linear.app'] });
    expect(args).toEqual(expect.arrayContaining(['-s', '--no-custom-instructions', '--disable-builtin-mcps']));
    const pairs = args.map((a, i) => `${a} ${args[i + 1] ?? ''}`);
    expect(pairs).toEqual(expect.arrayContaining(['--deny-tool shell', '--deny-tool write', '--add-dir ' + PROMPT_DIR, '--allow-url notion.so', '--allow-url linear.app']));
    expect(args).not.toContain('--allow-all-tools');
    expect(buildCopilotArgs({ kind: 'chat', prompt: 'p' })).not.toContain('--allow-url');
    expect(copilotProvider.listServersArgs).toBeNull();
  });

  it('reads the plain reply, without colour codes or a wrapping fence, and refuses an empty one', () => {
    expect(parseCopilotOutput('\u001b[0mHello\n', 'chat')).toEqual({ ok: true, value: 'Hello' });
    expect(parseCopilotOutput('```markdown\n# Title\n```\n', 'convert')).toEqual({ ok: true, value: '# Title' });
    const unreadable = parseCopilotOutput('CANNOT_READ: the file is empty', 'convert');
    expect(!unreadable.ok && unreadable.error.message).toBe("Copilot couldn't read the file: the file is empty Nothing was changed.");
    expect(parseCopilotOutput('  \n', 'chat').ok).toBe(false);
  });

  it('takes each http(s) host of the links once', () => {
    expect(linkHosts(['https://notion.so/a', 'https://notion.so/b', 'http://x.dev/c', 'mailto:a@b.c', 'not a url'])).toEqual(['notion.so', 'x.dev']);
  });
});

describe('the registry and the choice', () => {
  it('lists every provider once and finds each by id', () => {
    expect(LLM_PROVIDERS.map((p) => p.id)).toEqual(['claude', 'copilot']);
    expect(llmProvider('copilot')).toBe(copilotProvider);
  });

  it('asks before anything is picked, and says when the default isn\'t installed', () => {
    const locate = (id: string) => (id === 'copilot' ? 'C:\\npm\\copilot.cmd' : null);
    expect(lookupFrom(null, locate)).toEqual({ state: 'unchosen' });
    expect(lookupFrom('copilot', locate)).toEqual({ state: 'ready', llm: { provider: 'copilot', path: 'C:\\npm\\copilot.cmd' } });
    expect(lookupFrom('claude', locate)).toEqual({ state: 'missing', provider: 'claude' });
    expect(choiceStatus('copilot', locate)).toEqual({
      current: 'copilot',
      providers: [
        { id: 'claude', name: 'Claude Code CLI', installed: false, installHint: claudeProvider.installHint },
        { id: 'copilot', name: 'GitHub Copilot CLI', installed: true, installHint: copilotProvider.installHint }
      ]
    });
  });

  it('says how to install the missing one', () => {
    expect(notFoundWarning(copilotProvider, 'ask again.')).toMatch(/^Couldn't find the GitHub Copilot CLI \(`copilot`\)\. Install it .* Then ask again\.$/);
  });
});
