import { describe, it, expect } from 'vitest';
import { lastSyncLine } from '../last-sync';

const now = new Date('2026-09-30T12:00:00Z');

describe('lastSyncLine', () => {
  it('says when and by what', () => {
    expect(lastSyncLine({ at: '2026-09-30T10:00:00Z', by: 'APP', outcome: 'OK', message: null }, now))
      .toMatchObject({ tone: 'ok', text: 'Last synced 2h ago by Sync now.' });
    expect(lastSyncLine({ at: new Date('2026-09-30T11:30:00Z'), by: 'CLAUDE', outcome: 'OK', message: null }, now))
      .toMatchObject({ tone: 'ok', text: 'Last synced 30m ago by Claude in a chat.' });
    expect(lastSyncLine({ at: '2026-09-30T10:00:00Z', by: null, outcome: 'OK', message: null }, now).text).toBe('Last synced 2h ago.');
  });

  it('names the sources a partial sync skipped, and why one failed', () => {
    expect(lastSyncLine({ at: '2026-09-30T10:00:00Z', by: 'APP', outcome: 'PARTIAL', message: 'Synced, except: Quote.pdf (blank scan).' }, now))
      .toMatchObject({ tone: 'warning', text: 'Last synced 2h ago by Sync now, except: Quote.pdf (blank scan).' });
    expect(lastSyncLine({ at: '2026-09-30T10:00:00Z', by: 'APP', outcome: 'FAILED', message: 'Claude Code exited without a reply.' }, now))
      .toMatchObject({ tone: 'error', text: 'Last sync failed 2h ago by Sync now: Claude Code exited without a reply.' });
  });

  it('warns after a week', () => {
    const line = lastSyncLine({ at: '2026-09-20T10:00:00Z', by: 'APP', outcome: 'OK', message: null }, now);
    expect(line.tone).toBe('warning');
    expect(line.text).toContain('Over a week ago');
  });
});
