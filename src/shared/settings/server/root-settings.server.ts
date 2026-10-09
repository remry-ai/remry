// <data dir>/settings.json: settings for the whole computer rather than one notebook.
//   defaultNotebook   the notebook the CLI and MCP use when none is named
//   licenseKey        the Remry Pro license key (src/shared/license/store.server.ts)
// Each writer changes only its own keys and keeps the rest.
// Relative imports only — prisma.config.ts and scripts load settings outside SvelteKit.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { rootSettingsPath } from './paths';
import type { ServerSettings } from './types';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The file's contents, or {} when it's missing or unreadable. */
export const readRootSettings = async (s: ServerSettings): Promise<Readonly<Record<string, unknown>>> => {
  try {
    const data: unknown = JSON.parse(await readFile(rootSettingsPath(s), 'utf8'));
    return isRecord(data) ? data : {};
  } catch {
    return {};
  }
};

/**
 * Sets the given keys and keeps every other one; a key set to undefined is removed.
 * Writes a temporary file, then renames it, so a reader never sees half a file.
 */
export const updateRootSettings = async (s: ServerSettings, changes: Readonly<Record<string, unknown>>): Promise<void> => {
  const next: Record<string, unknown> = { ...(await readRootSettings(s)) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  await mkdir(s.dataDir, { recursive: true });
  const path = rootSettingsPath(s);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
};
