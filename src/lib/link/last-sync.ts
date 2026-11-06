// The line a sync doc's or page's banner shows about its last sync. Pure: the time comes in.

import type { SyncOutcome, SyncRunnerKind } from '$shared/types/enums';
import { isSyncStale } from '$shared/utils/sync-state';
import { timeAgo } from '$lib/home/utils';

/** A last sync as the page gets it: over HTTP its time is a string. */
export interface LastSyncView {
  readonly at: Date | string;
  readonly by: SyncRunnerKind | null;
  readonly outcome: SyncOutcome;
  readonly message: string | null;
}

export interface LastSyncLine {
  readonly tone: 'ok' | 'warning' | 'error';
  readonly text: string;
  /** The full time, for a tooltip. */
  readonly title: string;
}

const BY: Readonly<Record<SyncRunnerKind, string>> = { APP: 'Sync now', CLAUDE: 'Claude in a chat' };

/** "Last synced 2h ago by Sync now", a partial one's unread sources, or why the last one failed. */
export const lastSyncLine = (sync: LastSyncView, now: Date = new Date()): LastSyncLine => {
  const at = typeof sync.at === 'string' ? new Date(sync.at) : sync.at;
  const when = timeAgo(at, now);
  const by = sync.by ? ` by ${BY[sync.by]}` : '';
  const title = at.toLocaleString();
  if (sync.outcome === 'FAILED') {
    return { tone: 'error', text: `Last sync failed ${when}${by}${sync.message ? `: ${sync.message}` : '.'}`, title };
  }
  const stale = isSyncStale(at, now);
  const text = `Last synced ${when}${by}`;
  if (sync.outcome === 'PARTIAL' && sync.message) {
    // The message is the sync's own "Synced, except: …".
    const except = sync.message.replace(/^Synced,\s*/i, '');
    return { tone: 'warning', text: `${text}, ${except}`, title };
  }
  return stale
    ? { tone: 'warning', text: `${text}. Over a week ago: choose Sync now to bring it up to date.`, title }
    : { tone: 'ok', text: `${text}.`, title };
};
