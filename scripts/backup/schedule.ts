// Hourly backups from inside a long-running Remry process (the MCP server,
// the release app), so every platform gets them without an OS scheduler. Several
// processes, and the macOS LaunchAgent, may run at once: a lock file makes one of
// them take the snapshots, and a last-run file makes the others skip the hour.

import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { settings } from '$shared/settings/server/index.server';
import { backupsRoot } from '$shared/settings/server/paths';
import { readNotebooks } from '$shared/notebooks/current.server';
import { createSnapshot } from './snapshot';
import { replaceLegacyAgent } from './launchd';

export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;
/** How often a process checks whether the hour is up. */
export const BACKUP_CHECK_MS = 5 * 60 * 1000;
/** A lock older than this was left by a process that died mid-backup. */
export const STALE_LOCK_MS = 15 * 60 * 1000;

/** Pure. Due when there's no record of a run, or the last one was an interval ago (or in the future: a clock change). */
export const isBackupDue = (lastRun: Date | null, now: Date, intervalMs = BACKUP_INTERVAL_MS): boolean => {
  if (!lastRun || Number.isNaN(lastRun.getTime())) return true;
  const elapsed = now.getTime() - lastRun.getTime();
  return elapsed >= intervalMs || elapsed < 0;
};

/** Pure. Whether a lock file with this age can be taken over. */
export const isLockStale = (lockMtimeMs: number, nowMs: number, staleMs = STALE_LOCK_MS): boolean =>
  nowMs - lockMtimeMs > staleMs;

const lockPath = (): string => join(backupsRoot(settings), '.lock');
const lastRunPath = (): string => join(backupsRoot(settings), '.last-run');

export const readLastRun = async (): Promise<Date | null> => {
  const text = await readFile(lastRunPath(), 'utf8').catch(() => null);
  return text ? new Date(text.trim()) : null;
};

const recordRun = async (now: Date): Promise<void> => {
  await writeFile(lastRunPath(), `${now.toISOString()}\n`);
};

/**
 * Runs `work` while holding the backup lock. Resolves to null, without running it,
 * when another process holds a fresh lock.
 */
export const withBackupLock = async <T>(work: () => Promise<T>, now: () => Date = () => new Date()): Promise<T | null> => {
  await mkdir(backupsRoot(settings), { recursive: true });
  const path = lockPath();
  const take = async (): Promise<boolean> => {
    const handle = await open(path, 'wx').catch(() => null);
    if (!handle) return false;
    await handle.writeFile(`${process.pid}\n`);
    await handle.close();
    return true;
  };
  if (!(await take())) {
    const held = await stat(path).catch(() => null);
    if (held && !isLockStale(held.mtimeMs, now().getTime())) return null;
    await rm(path, { force: true });
    if (!(await take())) return null;
  }
  try {
    return await work();
  } finally {
    await rm(path, { force: true });
  }
};

export interface ScheduledRunResult {
  readonly created: readonly string[];
  readonly failed: readonly string[];
}

/** Snapshots every changed notebook if the hour is up and no other process is doing it. Null when it skipped. */
export const runBackupsIfDue = async (now: () => Date = () => new Date()): Promise<ScheduledRunResult | null> => {
  if (!isBackupDue(await readLastRun(), now())) return null;
  return withBackupLock(async () => {
    // Another process may have finished the hour while this one waited for the lock.
    if (!isBackupDue(await readLastRun(), now())) return null;
    const created: string[] = [];
    const failed: string[] = [];
    for (const notebook of await readNotebooks()) {
      try {
        const outcome = await createSnapshot({ notebook: notebook.id, reason: 'hourly', now: now() });
        if (outcome.status === 'created' && outcome.snapshot) created.push(`${notebook.id}/${outcome.snapshot.id}`);
      } catch (error) {
        failed.push(`${notebook.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await recordRun(now());
    return { created, failed };
  }, now);
};

/**
 * Starts checking every few minutes, and once shortly after start. The timer doesn't
 * keep the process alive. Returns a function that stops it.
 */
export const startBackupSchedule = (log: (message: string) => void): (() => void) => {
  void replaceLegacyAgent().then((result) => {
    if (!result.ok) log(`Couldn't replace the hourly backup LaunchAgent from before the rename to Remry: ${result.error.message}`);
    else if (result.value.replaced) log('Replaced the hourly backup LaunchAgent from before the rename to Remry.');
  });
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await runBackupsIfDue();
      if (result && (result.created.length || result.failed.length)) {
        const parts = [
          result.created.length ? `created ${result.created.join(', ')}` : '',
          result.failed.length ? `failed ${result.failed.join('; ')}` : ''
        ].filter(Boolean);
        log(`Hourly backup: ${parts.join('; ')}`);
      }
    } catch (error) {
      log(`Hourly backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 30_000);
  const interval = setInterval(() => void tick(), BACKUP_CHECK_MS);
  first.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
};
