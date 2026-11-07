// A sync doc's or page's sync state, kept short: a tone (the dot's colour) and when, with the full
// sentence for the tooltip. Pure: the time comes in.

import type { SyncOutcome, SyncRunnerKind } from '$shared/types/enums';
import type { SyncNeed } from '$shared/types/sync-now';
import { isSyncStale } from '$shared/utils/sync-state';
import { timeAgo } from '$lib/home/utils';

/** A last sync as the page gets it: over HTTP its time is a string. */
export interface LastSyncView {
  readonly at: Date | string;
  readonly by: SyncRunnerKind | null;
  readonly outcome: SyncOutcome;
  readonly message: string | null;
}

/** ok: current; warning: over a week old, a source skipped, or never synced; error: the last sync failed; none: no sources. */
export type SyncTone = 'ok' | 'warning' | 'error' | 'none';

export interface SyncStatusView {
  readonly tone: SyncTone;
  /** When, as shown: "2h ago", "12 Oct", or "Not synced". */
  readonly text: string;
  /** The full sentence: by what, what it skipped, why it failed, and the exact time. */
  readonly title: string;
}

const BY: Readonly<Record<SyncRunnerKind, string>> = { APP: 'Sync now', CLAUDE: 'Claude in a chat' };

const NOT_SYNCED: SyncStatusView = { tone: 'warning', text: 'Not synced', title: 'Not synced from its sources yet.' };

/** The state of a sync doc or page from its last sync; null (never synced) reads "Not synced". */
export const syncStatus = (sync: LastSyncView | null, now: Date = new Date()): SyncStatusView => {
  if (!sync) return NOT_SYNCED;
  const at = typeof sync.at === 'string' ? new Date(sync.at) : sync.at;
  const when = timeAgo(at, now);
  const by = sync.by ? ` by ${BY[sync.by]}` : '';
  const exact = ` (${at.toLocaleString()})`;
  if (sync.outcome === 'FAILED') {
    return { tone: 'error', text: when, title: `Last sync failed${by}${exact}${sync.message ? `: ${sync.message}` : '.'}` };
  }
  const synced = `Last synced${by}${exact}`;
  if (sync.outcome === 'PARTIAL' && sync.message) {
    // The message is the sync's own "Synced, except: …".
    return { tone: 'warning', text: when, title: `${synced}, ${sync.message.replace(/^Synced,\s*/i, '')}` };
  }
  return isSyncStale(at, now)
    ? { tone: 'warning', text: when, title: `${synced}. Over a week ago.` }
    : { tone: 'ok', text: when, title: `${synced}.` };
};

/** The tone for a list row that only knows why it wants syncing (null: it doesn't). */
export const syncNeedTone = (need: SyncNeed | null | undefined): SyncTone =>
  need === 'failed' ? 'error' : need ? 'warning' : 'ok';
