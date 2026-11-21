import { describe, it, expect } from 'vitest';
import { sourceName, syncReportNote } from '../sync-report';
import { missingConnector } from '$shared/utils/link-source';

const sources = [
  { id: 'n', title: 'Notion: Checkout PRD', url: 'https://www.notion.so/acme/Checkout-PRD-0123' },
  { id: 'l', title: 'Linear: Checkout', url: 'https://linear.app/acme/project/checkout' },
  { id: 'f', title: 'Quote.pdf', url: null }
];

describe('syncReportNote', () => {
  it('is null when every source was read', () => {
    expect(syncReportNote({ assistant: 'Claude Code', servers: [], sources, read: ['n', 'l', 'f'], unread: [] })).toBeNull();
  });

  it('says how many it read, each it couldn\'t and why, and names the connectors it lacks', () => {
    const note = syncReportNote({ assistant: 'Claude Code', servers: ['claude.ai Linear'], sources, read: ['l'], unread: [{ id: 'n', reason: 'needs sign-in' }] });
    expect(note?.split('\n')).toEqual([
      'Synced from 1 of 3 sources.',
      "Couldn't read: Notion: Checkout PRD (needs sign-in); Quote.pdf (not reported).",
      'Claude Code on this computer has no Notion connector, so it can only open public pages there. Connect it to Claude Code, or ask Claude in Cowork or Claude desktop to sync this: they use your claude.ai connectors.'
    ]);
  });

  it('points to Cowork when a connector is there but the source still wasn\'t read', () => {
    const note = syncReportNote({ assistant: 'Claude Code', servers: ['Notion'], sources: sources.slice(0, 1), read: [], unread: [{ id: 'n', reason: 'page not shared' }] });
    expect(note?.split('\n')[0]).toBe("Claude Code couldn't read any of the sources, so nothing was changed.");
    expect(note?.split('\n')[2]).toContain('Ask Claude in Cowork or Claude desktop');
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
