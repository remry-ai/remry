// Puts the data directory into the notebook layout before anything opens a database:
// moves a pre-notebooks database, files and snapshots into the notebook `work-work`,
// creates a first notebook in a fresh data directory, and sets the default.
// Every move is a rename within the data directory, so nothing is copied or deleted.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { settings as appSettings, type ServerSettings } from '$shared/settings/server/index.server';
import {
  backupsDir,
  backupsRoot,
  databasePath,
  filesDir,
  legacyDatabasePath,
  legacyFilesDir,
  notebookDir
} from '$shared/settings/server/paths';
import { EARLIER_MOVED_NOTES, MOVED_NOTE } from '$shared/settings/server/legacy-data-dir';
import { LEGACY_NOTEBOOK, planLayout, type LayoutState, type LayoutStep } from './layout';
import { createNotebookStore, type NotebookStore } from './store.server';

const LOCK_FILE = '.notebooks.lock';
const LOCK_STALE_MS = 2 * 60 * 1000;
const LOCK_WAIT_MS = 100;
const LOCK_ATTEMPTS = 100;

const readLayoutState = async (s: ServerSettings, store: NotebookStore): Promise<LayoutState> => {
  const backups = await readdir(backupsRoot(s), { withFileTypes: true }).catch(() => []);
  return {
    legacyDatabase: existsSync(legacyDatabasePath(s)),
    legacyFiles: existsSync(legacyFilesDir(s)),
    // Snapshot folders have a manifest; per-notebook folders don't.
    legacySnapshots: backups
      .filter((e) => e.isDirectory() && existsSync(join(backupsRoot(s), e.name, 'manifest.json')))
      .map((e) => e.name)
      .sort(),
    notebookIds: (await store.list()).map((n) => n.id),
    legacyTargetHasDatabase: existsSync(databasePath(s, LEGACY_NOTEBOOK.id)),
    legacyTargetHasFiles: existsSync(filesDir(s, LEGACY_NOTEBOOK.id)),
    defaultId: await store.getDefault()
  };
};

/** Held while moving, so the app and the CLI starting together don't both move. */
const acquireLock = async (path: string): Promise<() => Promise<void>> => {
  for (let attempt = 0; ; attempt++) {
    try {
      await (await open(path, 'wx')).close();
      return () => rm(path, { force: true });
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      const lock = await stat(path).catch(() => null);
      if (lock && Date.now() - lock.mtimeMs > LOCK_STALE_MS) {
        await rm(path, { force: true });
        continue;
      }
      if (attempt >= LOCK_ATTEMPTS) {
        throw new Error(`Another Remry process is setting up notebooks. If none is running, delete ${path}.`);
      }
      await new Promise((done) => setTimeout(done, LOCK_WAIT_MS));
    }
  }
};

/** Other processes with the file open, from lsof. Empty if lsof isn't available. */
const otherProcessesUsing = (path: string): readonly string[] => {
  const result = spawnSync('lsof', ['-t', '--', path], { encoding: 'utf8' });
  if (result.error || typeof result.stdout !== 'string') return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((pid) => pid !== '' && pid !== String(process.pid));
};

const applyStep = async (s: ServerSettings, store: NotebookStore, step: LayoutStep, now: () => Date): Promise<void> => {
  const id = LEGACY_NOTEBOOK.id;
  switch (step.kind) {
    case 'create-notebook':
      await store.create({ id: step.id, name: step.name, profile: 'work', createdAt: now().toISOString() });
      return;
    case 'move-database': {
      const from = legacyDatabasePath(s);
      // Fold the write-ahead log into the database, so the move carries every write.
      const client = createClient({ url: `file:${from}` });
      try {
        await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
      } finally {
        client.close();
      }
      await mkdir(notebookDir(s, id), { recursive: true });
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(`${from}${suffix}`)) await rename(`${from}${suffix}`, `${databasePath(s, id)}${suffix}`);
      }
      return;
    }
    case 'move-files':
      await mkdir(notebookDir(s, id), { recursive: true });
      await rename(legacyFilesDir(s), filesDir(s, id));
      return;
    case 'move-snapshot':
      await mkdir(backupsDir(s, id), { recursive: true });
      await rename(join(backupsRoot(s), step.snapshotId), join(backupsDir(s, id), step.snapshotId));
      return;
    case 'set-default':
      await store.setDefault(step.id);
      return;
  }
};

/** Applies whatever the layout still needs and returns the steps taken. Not memoised. */
export const migrateLayout = async (s: ServerSettings, now: () => Date = () => new Date()): Promise<readonly LayoutStep[]> => {
  // This process kept the old data directory while another moved it (see legacy-data-dir.ts):
  // never start an empty notebook where the data used to be.
  const moved = [MOVED_NOTE, ...EARLIER_MOVED_NOTES].some((note) => existsSync(join(s.dataDir, note)));
  if (moved && !existsSync(join(s.dataDir, 'Notebooks'))) {
    throw new Error('Your data has just moved to the Remry folder (Remry was called Wonos, and Working Notes before that). Restart Claude (or the Remry app) to use it.');
  }
  const store = createNotebookStore(s);
  const quick = planLayout(await readLayoutState(s, store));
  if (quick.ok && quick.value.length === 0) return [];

  await mkdir(s.dataDir, { recursive: true });
  const release = await acquireLock(join(s.dataDir, LOCK_FILE));
  try {
    // Plan again under the lock: another process may have just done it.
    const plan = planLayout(await readLayoutState(s, store));
    if (!plan.ok) throw plan.error;

    if (plan.value.some((step) => step.kind === 'move-database')) {
      const users = otherProcessesUsing(legacyDatabasePath(s));
      if (users.length > 0) {
        throw new Error(
          `Remry needs to move your notebook into Notebooks/${LEGACY_NOTEBOOK.id}, but process ${users.join(', ')} still has the database open. ` +
            'Quit the Remry app and restart any Claude sessions using Remry, then try again.'
        );
      }
    }

    for (const step of plan.value) await applyStep(s, store, step, now);
    return plan.value;
  } finally {
    await release();
  }
};

let ready: Promise<void> | undefined;

/** Idempotent per process. Startup infrastructure: throws if the layout can't be prepared. */
export const ensureLayout = (): Promise<void> => {
  ready ??= migrateLayout(appSettings).then(
    () => undefined,
    (error: unknown) => {
      ready = undefined;
      throw error;
    }
  );
  return ready;
};
