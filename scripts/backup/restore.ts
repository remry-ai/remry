// Restore a snapshot into a notebook's live database and files. Refuses while the
// app is running, verifies the snapshot, and snapshots the current data first.

import { existsSync } from 'node:fs';
import { copyFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { settings } from '$shared/settings/server/index.server';
import { databasePath, filesDir } from '$shared/settings/server/paths';
import { migrateDatabase } from '$shared/db/bootstrap.server';
import { getRegistry } from '$shared/registry.server';
import { ok, err, type Result } from '$shared/utils/result';
import { createSnapshot, listSnapshots } from './snapshot';
import { isPortListening } from './port';

export const APP_PORT = 5173;

export interface RestoreOptions {
  readonly appPort?: number;
  readonly now?: Date;
}

export const restoreSnapshot = async (
  notebook: string,
  target: string,
  options: RestoreOptions = {}
): Promise<Result<{ readonly restored: string; readonly safetySnapshot: string | null }>> => {
  const port = options.appPort ?? APP_PORT;
  if (await isPortListening(port)) {
    return err(new Error(`Remry is running on 127.0.0.1:${port}. Quit it, then restore.`));
  }

  const snapshots = await listSnapshots(notebook);
  const snapshot = target === 'latest' ? snapshots[0] : snapshots.find((s) => s.id === target);
  if (!snapshot) {
    return err(new Error(target === 'latest'
      ? `Notebook ${notebook} has no snapshots to restore`
      : `Snapshot ${target} not found in notebook ${notebook}`));
  }

  const check = createClient({ url: `file:${join(snapshot.path, 'working-notes.db')}` });
  try {
    const verdict = String((await check.execute('PRAGMA integrity_check')).rows[0]?.[0] ?? '');
    if (verdict !== 'ok') return err(new Error(`Snapshot ${snapshot.id} failed its integrity check: ${verdict}`));
  } finally {
    check.close();
  }

  const safety = await createSnapshot({
    notebook,
    force: true,
    reason: `pre-restore (before restoring ${snapshot.id})`,
    now: options.now
  });

  await getRegistry(notebook).prisma.$disconnect();
  const db = databasePath(settings, notebook);
  for (const suffix of ['', '-wal', '-shm']) await rm(`${db}${suffix}`, { force: true });
  await copyFile(join(snapshot.path, 'working-notes.db'), db);

  const files = filesDir(settings, notebook);
  await rm(files, { recursive: true, force: true });
  if (existsSync(join(snapshot.path, 'files'))) {
    await cp(join(snapshot.path, 'files'), files, { recursive: true });
  }

  // An older snapshot may predate newer migrations.
  await migrateDatabase(notebook);
  return ok({ restored: snapshot.id, safetySnapshot: safety.snapshot?.id ?? null });
};
