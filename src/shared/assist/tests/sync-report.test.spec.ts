import { describe, it, expect } from 'vitest';
import { ASK_CLAUDE, connectorReach, sourceName, syncReportNote } from '../sync-report';
import { missingConnector } from '$shared/utils/link-source';
import type { ConnectorProbe } from '$shared/types/sync-now';

const sources = [
  { id: 'n', title: 'Notion: Checkout PRD', url: 'https://www.notion.so/acme/Checkout-PRD-0123' },
  { id: 'l', title: 'Linear: Checkout', url: 'https://linear.app/acme/project/checkout' },
  { id: 'f', title: 'Quote.pdf', url: null }
];
const probe = (servers: ConnectorProbe['servers'], apiKeySource: string | null = 'none'): ConnectorProbe => ({ servers, apiKeySource });

describe('connectorReach', () => {
  it('says nothing when every tool has a connected server', () => {
    const all = probe([{ name: 'claude.ai Notion', status: 'connected' }, { name: 'claude.ai Linear', status: 'connected' }]);
    expect(connectorReach('Claude Code', all, sources)).toEqual({ unreachable: [], advice: [] });
  });

  it('says to sign in a connector that needs it, and how', () => {
    const reach = connectorReach('Claude Code', probe([{ name: 'claude.ai Notion', status: 'needs-auth' }, { name: 'claude.ai Linear', status: 'connected' }]), sources);
    expect(reach.unreachable).toEqual(['Notion: Checkout PRD']);
    expect(reach.advice).toEqual([
      'claude.ai Notion isn\'t signed in for Claude Code: run claude mcp login "claude.ai Notion" in a terminal, or /mcp in Claude Code.',
      ASK_CLAUDE
    ]);
  });

  it('names a connector that failed, and one it doesn\'t have', () => {
    const reach = connectorReach('Claude Code', probe([{ name: 'claude.ai Linear', status: 'failed' }]), sources);
    expect(reach.advice[0]).toBe('claude.ai Linear didn\'t connect in Claude Code (failed): check it with /mcp in Claude Code.');
    expect(reach.advice[1]).toContain('has no Notion connector. Add it at claude.ai');
  });

  it('says an API key loads no claude.ai connectors', () => {
    const reach = connectorReach('Claude Code', probe([], 'ANTHROPIC_API_KEY'), sources);
    expect(reach.unreachable).toEqual(['Notion: Checkout PRD', 'Linear: Checkout']);
    expect(reach.advice[0]).toBe('Claude Code is signed in with an API key (ANTHROPIC_API_KEY), so it doesn\'t load your claude.ai connectors, Notion or Linear among them. Sign it in with your Claude account (/login in Claude Code) to use them.');
  });
});

describe('syncReportNote', () => {
  it('is null when every source was read', () => {
    expect(syncReportNote({ assistant: 'Claude Code', probe: null, sources, read: ['n', 'l', 'f'], unread: [] })).toBeNull();
  });

  it('says how many it read, each it couldn\'t and why, and what to do', () => {
    const note = syncReportNote({ assistant: 'Claude Code', probe: probe([{ name: 'claude.ai Linear', status: 'connected' }]), sources, read: ['l'], unread: [{ id: 'n', reason: 'needs sign-in' }] });
    expect(note?.split('\n').slice(0, 2)).toEqual([
      'Synced from 1 of 3 sources.',
      "Couldn't read: Notion: Checkout PRD (needs sign-in); Quote.pdf (not reported)."
    ]);
    expect(note).toContain('has no Notion connector');
    expect(note?.split('\n').at(-1)).toBe(ASK_CLAUDE);
  });

  it('points to asking Claude when nothing explains it', () => {
    const note = syncReportNote({ assistant: 'Claude Code', probe: probe([{ name: 'Notion', status: 'connected' }]), sources: sources.slice(0, 1), read: [], unread: [{ id: 'n', reason: 'page not shared' }] });
    expect(note?.split('\n')).toEqual(["Claude Code couldn't read any of the sources, so nothing was changed.", "Couldn't read: Notion: Checkout PRD (page not shared).", ASK_CLAUDE]);
  });
});

describe('sourceName and missingConnector', () => {
  it('names a source by its tool, and finds a connector by its name', () => {
    expect(sourceName(sources[0]!)).toBe('Notion: Checkout PRD');
    expect(sourceName(sources[2]!)).toBe('Quote.pdf');
    expect(missingConnector('https://docs.google.com/document/d/1', ['claude.ai Google Drive'])).toBeNull();
    expect(missingConnector('https://docs.google.com/document/d/1', ['Linear'])?.name).toBe('Google Docs');
    expect(missingConnector('https://example.com/page', [])).toBeNull();
  });
});
