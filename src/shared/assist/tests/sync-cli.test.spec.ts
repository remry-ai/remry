import { describe, it, expect } from 'vitest';
import { SYNC_DENIED_TOOLS, buildSyncArgs, connectedMcpServers, mcpServerRule, parseSyncReply, syncPrompt } from '../sync-cli';

describe('syncPrompt', () => {
  it('gives the prompt, the current text and each kind of source', () => {
    const prompt = syncPrompt({
      kind: 'doc',
      title: 'Checkout brief',
      on: 'the project Checkout',
      prompt: 'PRD: scope. Linear: dates.',
      content: '# Old brief',
      sources: [
        { id: 'l1', title: 'Notion: PRD', url: 'https://notion.so/acme/PRD-1', fileName: null, text: null, sourceEditedAt: new Date('2026-10-20T08:00:00Z') },
        { id: 'l2', title: 'Pricing.pdf', url: null, fileName: 'file-a.pdf', text: '# Pricing\nPro: $10', sourceEditedAt: null },
        { id: 'l3', title: 'Scan.png', url: null, fileName: 'file-b.png', text: null, sourceEditedAt: null }
      ]
    });
    expect(prompt).toContain('"Checkout brief", on the project Checkout');
    expect(prompt).toContain('<prompt>\nPRD: scope. Linear: dates.\n</prompt>');
    expect(prompt).toContain('# Old brief');
    expect(prompt).toContain('<source id="l1" title="Notion: PRD" kind="link" url="https://notion.so/acme/PRD-1" last-synced-version-edited="2026-10-20T08:00:00.000Z" />');
    expect(prompt).toContain('kind="uploaded file, its text below">\n# Pricing\nPro: $10\n</source>');
    expect(prompt).toContain('<source id="l3" title="Scan.png" kind="uploaded file" file="./file-b.png" />');
    expect(prompt).toContain('Only read: never create, change, comment on or delete anything');
  });
});

describe('which tools a sync run gets', () => {
  it('allows only the connected servers, never Remry\'s own', () => {
    const listing = [
      'Checking MCP server health…',
      '',
      'claude.ai Notion: https://mcp.notion.com/mcp (HTTP) - ✓ Connected',
      'plugin:productivity:linear: https://mcp.linear.app/mcp (HTTP) - ✓ Connected',
      'plugin:remry:remry: sh ./scripts/remry mcp - ✓ Connected',
      'plugin:data:hex: https://app.hex.tech/mcp (HTTP) - × Failed to connect',
      'gmail:  (HTTP) - - Not configured'
    ].join('\n');
    expect(connectedMcpServers(listing)).toEqual(['claude.ai Notion', 'plugin:productivity:linear']);
    expect(['claude.ai Notion', 'plugin:productivity:linear'].map(mcpServerRule)).toEqual(['mcp__claude_ai_Notion', 'mcp__plugin_productivity_linear']);
  });

  it('asks nobody: Read, WebFetch and the named servers, and denies tools named for writing', () => {
    const args = buildSyncArgs(['claude.ai Notion']);
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(after('--tools')).toBe('Read,WebFetch');
    expect(after('--permission-mode')).toBe('dontAsk');
    expect(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools'))).toEqual(['Read', 'WebFetch', 'mcp__claude_ai_Notion']);
    expect(args).not.toContain('bypassPermissions');
    expect(SYNC_DENIED_TOOLS).toEqual(expect.arrayContaining(['mcp__*__create*', 'mcp__*__*-update*', 'mcp__*__*_delete*', 'mcp__*__*Comment*']));
  });
});

describe('parseSyncReply', () => {
  const ids = ['l1', 'l2', 'l3'];

  it('splits off the sources block, keeping known ids and edit times', () => {
    const reply = [
      '# Checkout brief',
      'Launch is 12 Nov (PRD).',
      '',
      '## Discrepancies',
      'None found.',
      '<!-- sources',
      'l1 read 2026-10-28T16:30:00Z',
      'l2 read -',
      'l3 unread the image is blank',
      'zz read 2026-01-01T00:00:00Z',
      '-->'
    ].join('\n');
    const parsed = parseSyncReply(reply, ids);
    expect(parsed.ok && parsed.value).toEqual({
      markdown: '# Checkout brief\nLaunch is 12 Nov (PRD).\n\n## Discrepancies\nNone found.',
      read: [{ id: 'l1', editedAt: new Date('2026-10-28T16:30:00Z') }, { id: 'l2', editedAt: null }],
      unread: [{ id: 'l3', reason: 'the image is blank' }]
    });
  });

  it('changes nothing without the block, or when no source was read', () => {
    const none = parseSyncReply('# Brief', ids);
    expect(!none.ok && none.error.message).toContain("didn't say which sources");
    const unread = parseSyncReply('Sorry.\n<!-- sources\nl1 unread no Notion access\n-->', ids);
    expect(!unread.ok && unread.error.message).toBe("Claude couldn't read any of the sources (no Notion access), so nothing was changed.");
  });
});
