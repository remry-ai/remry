// Database bootstrap: put the data directory in the notebook layout, create the
// notebook's folder, apply pending migrations and configure SQLite for concurrent
// use. Runs at server start (hooks `init`), for each notebook a request, CLI call or
// backup first touches, and in integration test setup.

import { mkdirSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { settings } from '$shared/settings/server/index.server';
import { databaseUrl, migrationsDir, notebookDir } from '$shared/settings/server/paths';
import { ensureLayout } from '$shared/notebooks/layout.server';
import { getRegistry } from '$shared/registry.server';
import type { Registry } from '$shared/registry';
import { applyMigrations } from './migrate.server';

/** Apply migrations and enable WAL. Not memoised: use after replacing the database file. */
export const migrateDatabase = async (notebookId: string): Promise<void> => {
  mkdirSync(notebookDir(settings, notebookId), { recursive: true });
  const client = createClient({ url: databaseUrl(settings, notebookId) });
  try {
    // WAL is persistent: the app, the CLI and backups can then read and write concurrently.
    await client.execute('PRAGMA journal_mode = WAL');
    const result = await applyMigrations(client, migrationsDir(), getRegistry(notebookId).logger);
    if (!result.ok) throw new Error(`Database migration failed for notebook ${notebookId}: ${result.error.message}`);
  } finally {
    client.close();
  }
};

const ready = new Map<string, Promise<void>>();

/** Idempotent per notebook, per process. Startup infrastructure: throws if the database can't be prepared. */
export const ensureDatabase = (notebookId: string): Promise<void> => {
  const existing = ready.get(notebookId);
  if (existing) return existing;
  const preparing = ensureLayout()
    .then(() => migrateDatabase(notebookId))
    .then(async () => {
      await getRegistry(notebookId).prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    });
  ready.set(notebookId, preparing);
  preparing.catch(() => ready.delete(notebookId));
  return preparing;
};

/** The notebook's Registry, once its database is ready. */
export const getReadyRegistry = async (notebookId: string): Promise<Registry> => {
  await ensureDatabase(notebookId);
  return getRegistry(notebookId);
};
