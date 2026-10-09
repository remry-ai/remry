// Filesystem locations derived from settings.dataDir.
// Relative imports only — prisma.config.ts loads this outside SvelteKit.
//
// <data dir>/settings.json                the default notebook for the CLI and MCP, and the license key
// <data dir>/Notebooks/<id>/              one notebook: notebook.json, working-notes.db, files/
// <data dir>/Backups/<id>/<snapshot>/     that notebook's snapshots

import { resolve } from 'node:path';
import { isNotebookId } from '../../notebooks/id';
import type { ServerSettings } from './types';

const DATABASE_FILE = 'working-notes.db';

/** Notebook ids become folder names, so a bad one is a bug, never a path. */
const checked = (id: string): string => {
  if (!isNotebookId(id)) throw new Error(`Invalid notebook id: ${JSON.stringify(id)}`);
  return id;
};

export const rootSettingsPath = (s: ServerSettings): string => resolve(s.dataDir, 'settings.json');

export const notebooksDir = (s: ServerSettings): string => resolve(s.dataDir, 'Notebooks');

export const notebookDir = (s: ServerSettings, id: string): string => resolve(notebooksDir(s), checked(id));

export const databasePath = (s: ServerSettings, id: string): string => resolve(notebookDir(s, id), DATABASE_FILE);

export const databaseUrl = (s: ServerSettings, id: string): string => `file:${databasePath(s, id)}`;

export const filesDir = (s: ServerSettings, id: string): string => resolve(notebookDir(s, id), 'files');

export const backupsRoot = (s: ServerSettings): string => resolve(s.dataDir, 'Backups');

export const backupsDir = (s: ServerSettings, id: string): string => resolve(backupsRoot(s), checked(id));

/** Where the one notebook lived before there were notebooks. ensureLayout() moves it. */
export const legacyDatabasePath = (s: ServerSettings): string => resolve(s.dataDir, DATABASE_FILE);

export const legacyFilesDir = (s: ServerSettings): string => resolve(s.dataDir, 'files');

/**
 * The migrations: next to the standalone binary (it sets REMRY_MIGRATIONS_DIR), or in the
 * repo, since processes from a clone run from its root (the CLI chdirs there).
 */
export const migrationsDir = (): string => process.env['REMRY_MIGRATIONS_DIR'] || resolve('prisma', 'migrations');
