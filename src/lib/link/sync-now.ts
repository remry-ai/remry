// "Sync now" from the browser: start the local Claude's rewrite of a sync doc or page (sync.now),
// then poll sync.status until it's done.

import { trpc } from '$shared/trpc/client';
import { submitOrThrow } from '$lib/ui/submit';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncNowOutcome {
  readonly tone: 'warning' | 'done';
  readonly message: string;
}

/** Syncs and waits. A warning when nothing ran (no `claude`), a note when some sources weren't read, else null. Throws when it fails. */
export const syncNowAndWait = async (entityType: 'DOC' | 'PAGE', id: string, pollMs = 3000): Promise<SyncNowOutcome | null> => {
  const started = await submitOrThrow(() => trpc().sync.now.mutate({ entityType, id }));
  if (!started.started) return { tone: 'warning', message: started.warning };
  for (;;) {
    await wait(pollMs);
    const status = await submitOrThrow(() => trpc().sync.status.query({ entityType, id }));
    if (status.state === 'running') continue;
    if (status.state === 'failed') throw new Error(status.message ?? 'Sync failed.');
    return status.message ? { tone: 'done', message: status.message } : null;
  }
};
