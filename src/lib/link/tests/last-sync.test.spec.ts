import { describe, it, expect } from 'vitest';
import { syncNeedTone, syncStatus } from '../last-sync';

const now = new Date('2026-09-30T12:00:00Z');

describe('syncStatus', () => {
  it('is a tone and when, with by what in the tooltip', () => {
    const ok = syncStatus({ at: '2026-09-30T10:00:00Z', by: 'APP', outcome: 'OK', message: null }, now);
    expect(ok).toMatchObject({ tone: 'ok', text: '2h ago' });
    expect(ok.title).toMatch(/^Last synced by Sync now \(.+\)\.$/);
    expect(syncStatus({ at: new Date('2026-09-30T11:30:00Z'), by: 'CLAUDE', outcome: 'OK', message: null }, now).title).toContain('by Claude in a chat');
    expect(syncStatus(null, now)).toMatchObject({ tone: 'warning', text: 'Not synced' });
  });

  it('keeps a partial sync\'s skipped sources and a failure\'s reason in the tooltip', () => {
    const partial = syncStatus({ at: '2026-09-30T10:00:00Z', by: 'APP', outcome: 'PARTIAL', message: 'Synced, except: Quote.pdf (blank scan).' }, now);
    expect(partial).toMatchObject({ tone: 'warning', text: '2h ago' });
    expect(partial.title).toMatch(/, except: Quote\.pdf \(blank scan\)\.$/);
    const failed = syncStatus({ at: '2026-09-30T10:00:00Z', by: 'APP', outcome: 'FAILED', message: 'Claude Code exited without a reply.' }, now);
    expect(failed).toMatchObject({ tone: 'error', text: '2h ago' });
    expect(failed.title).toMatch(/^Last sync failed by Sync now .+: Claude Code exited without a reply\.$/);
  });

  it('turns amber after a week', () => {
    expect(syncStatus({ at: '2026-09-20T10:00:00Z', by: 'APP', outcome: 'OK', message: null }, now).tone).toBe('warning');
  });
});

describe('syncNeedTone', () => {
  it('is red for a failure, amber for any other need, green otherwise', () => {
    expect([syncNeedTone('failed'), syncNeedTone('stale'), syncNeedTone('never'), syncNeedTone(null)]).toEqual(['error', 'warning', 'warning', 'ok']);
  });
});
