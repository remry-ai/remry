// When a sync doc or page wants syncing, from its last sync and its sources. Pure: the time comes in.

import { SYNC_OUTCOMES, SYNC_RUNNERS, type SyncOutcome, type SyncRunnerKind } from '$shared/types/enums';
import type { LastSync, SyncNeed } from '$shared/types/sync-now';

/** Days after which a sync reads as out of date; the skill re-syncs past this too. */
export const SYNC_STALE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when `at` was more than `SYNC_STALE_DAYS` ago. */
export const isSyncStale = (at: Date | string, now: Date = new Date()): boolean => {
  const date = typeof at === 'string' ? new Date(at) : at;
  return now.getTime() - date.getTime() > SYNC_STALE_DAYS * DAY_MS;
};

/** The last-sync columns of a doc or page row. */
export interface LastSyncColumns {
  readonly lastSyncAt: Date | null;
  readonly lastSyncBy: string | null;
  readonly lastSyncOutcome: string | null;
  readonly lastSyncMessage: string | null;
}

const isRunner = (value: string | null): value is SyncRunnerKind => (SYNC_RUNNERS as readonly (string | null)[]).includes(value);
const isOutcome = (value: string | null): value is SyncOutcome => (SYNC_OUTCOMES as readonly (string | null)[]).includes(value);

/** The row's last sync, or null when it has never been synced. */
export const readLastSync = (row: LastSyncColumns): LastSync | null =>
  row.lastSyncAt
    ? {
        at: row.lastSyncAt,
        by: isRunner(row.lastSyncBy) ? row.lastSyncBy : null,
        outcome: isOutcome(row.lastSyncOutcome) ? row.lastSyncOutcome : 'OK',
        message: row.lastSyncMessage
      }
    : null;

export interface SyncSourceKind {
  /** An uploaded file, read as it is: it never goes out of date. */
  readonly isFile: boolean;
}

/**
 * Why a sync doc or page wants syncing, or null when it doesn't. One with no sources has nothing to
 * sync from; one whose sources are all uploaded files only needs its first sync.
 */
export const syncNeed = (lastSync: LastSync | null, sources: readonly SyncSourceKind[], now: Date): SyncNeed | null => {
  if (sources.length === 0) return null;
  if (!lastSync) return 'never';
  if (lastSync.outcome === 'FAILED') return 'failed';
  if (sources.some((s) => !s.isFile) && isSyncStale(lastSync.at, now)) return 'stale';
  return null;
};

/** A few words for each need, for a badge or a row. */
export const SYNC_NEED_LABELS: Readonly<Record<SyncNeed, string>> = {
  never: 'Not synced yet',
  failed: 'Last sync failed',
  stale: 'Out of date'
};
