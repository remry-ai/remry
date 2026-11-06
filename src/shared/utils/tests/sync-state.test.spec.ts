import { describe, it, expect } from 'vitest';
import { isSyncStale, readLastSync, syncNeed } from '../sync-state';
import type { LastSync } from '$shared/types/sync-now';

const now = new Date('2026-09-30T12:00:00Z');
const at = (iso: string, outcome: LastSync['outcome'] = 'OK'): LastSync => ({ at: new Date(iso), by: 'APP', outcome, message: null });
const web = { isFile: false };
const file = { isFile: true };

describe('isSyncStale', () => {
  it('is stale after a week', () => {
    expect(isSyncStale('2026-09-24T12:00:00Z', now)).toBe(false);
    expect(isSyncStale(new Date('2026-09-23T11:00:00Z'), now)).toBe(true);
  });
});

describe('readLastSync', () => {
  it('is null until a sync, and reads an unknown runner or outcome safely', () => {
    expect(readLastSync({ lastSyncAt: null, lastSyncBy: null, lastSyncOutcome: null, lastSyncMessage: null })).toBeNull();
    expect(readLastSync({ lastSyncAt: now, lastSyncBy: 'ROBOT', lastSyncOutcome: null, lastSyncMessage: null }))
      .toEqual({ at: now, by: null, outcome: 'OK', message: null });
    expect(readLastSync({ lastSyncAt: now, lastSyncBy: 'CLAUDE', lastSyncOutcome: 'FAILED', lastSyncMessage: 'No reply.' }))
      .toEqual({ at: now, by: 'CLAUDE', outcome: 'FAILED', message: 'No reply.' });
  });
});

describe('syncNeed', () => {
  it('needs nothing without sources', () => {
    expect(syncNeed(null, [], now)).toBeNull();
  });

  it('wants a first sync, a retry after a failure, and a refresh after a week', () => {
    expect(syncNeed(null, [web], now)).toBe('never');
    expect(syncNeed(at('2026-09-30T11:00:00Z', 'FAILED'), [web], now)).toBe('failed');
    expect(syncNeed(at('2026-09-20T12:00:00Z'), [web], now)).toBe('stale');
    expect(syncNeed(at('2026-09-29T12:00:00Z'), [web], now)).toBeNull();
    expect(syncNeed(at('2026-09-29T12:00:00Z', 'PARTIAL'), [web], now)).toBeNull();
  });

  it('never goes stale on uploaded files alone, which don\'t change', () => {
    expect(syncNeed(at('2026-01-01T12:00:00Z'), [file], now)).toBeNull();
    expect(syncNeed(null, [file], now)).toBe('never');
    expect(syncNeed(at('2026-01-01T12:00:00Z'), [file, web], now)).toBe('stale');
  });
});
