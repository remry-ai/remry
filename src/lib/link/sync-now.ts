// "Sync now" from the browser: start the local assistant's rewrite of an entity's sync doc or a sync
// page (sync.now, by the entity), then poll sync.status until it's done.

import { trpc } from '$shared/trpc/client';
import { submitOrThrow } from '$lib/ui/submit';
import { startWithLlm } from '$lib/assist/ask-llm';
import type { SyncHolderRef } from '$shared/utils/sync-state';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncNowOutcome {
  readonly tone: 'warning' | 'done';
  readonly message: string;
}

/** Syncs and waits. A warning when nothing ran (no `claude`), a note when some sources weren't read, else null. Throws when it fails. */
export const syncNowAndWait = async (holder: SyncHolderRef, pollMs = 3000): Promise<SyncNowOutcome | null> => {
  const started = await startWithLlm(() => submitOrThrow(() => trpc().sync.now.mutate(holder)));
  if (!started.started) return { tone: 'warning', message: started.warning };
  return await untilFinished(holder, pollMs);
};

const untilFinished = async (holder: SyncHolderRef, pollMs: number): Promise<SyncNowOutcome | null> => {
  for (;;) {
    await wait(pollMs);
    const status = await submitOrThrow(() => trpc().sync.status.query(holder));
    if (status.state === 'running') continue;
    if (status.state === 'failed') throw new Error(status.message ?? 'Sync failed.');
    return status.message ? { tone: 'done', message: status.message } : null;
  }
};

/** Whether a sync of it is running now (started before the page opened); `waitForSync` then waits for it. */
export const syncRunning = async (holder: SyncHolderRef): Promise<boolean> => {
  const status = await trpc().sync.status.query(holder);
  return status.ok && status.value.state === 'running';
};

/** Waits for a running sync to finish. Throws when it fails; its outcome is saved as the last sync either way. */
export const waitForSync = (holder: SyncHolderRef, pollMs = 3000): Promise<SyncNowOutcome | null> =>
  untilFinished(holder, pollMs);
