// Native per-user locations, the way a desktop app stores its data.
// Relative imports only — prisma.config.ts and scripts load this outside SvelteKit.

import { homedir, platform } from 'node:os';
import { posix, win32 } from 'node:path';
import { moveLegacyDataDir } from './legacy-data-dir';

const { join } = posix;

const APP_NAME = 'Remry';
const APP_SLUG = 'remry';
/** Earlier names, newest first. moveLegacyDataDir (legacy-data-dir.ts) moves the data from there. */
const LEGACY_APP_NAMES: readonly { readonly name: string; readonly slug: string }[] = [
  { name: 'Wonos', slug: 'wonos' },
  { name: 'Working Notes', slug: 'working-notes' }
];

export interface AppDirsHost {
  readonly platform: NodeJS.Platform;
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

const currentHost = (): AppDirsHost => ({ platform: platform(), home: homedir(), env: process.env });

/**
 * Pure. `~/Library/Application Support/Remry` on macOS,
 * `%LOCALAPPDATA%\Remry` on Windows (local, not roaming: a SQLite database
 * must not follow a roaming profile), and the XDG data dir elsewhere.
 */
export const dataDirFor = (host: AppDirsHost, name = APP_NAME, slug = APP_SLUG): string => {
  if (host.platform === 'darwin') return join(host.home, 'Library', 'Application Support', name);
  if (host.platform === 'win32') return win32.join(host.env['LOCALAPPDATA'] || win32.join(host.home, 'AppData', 'Local'), name);
  return join(host.env['XDG_DATA_HOME'] || join(host.home, '.local', 'share'), slug);
};

/** Pure. Where the data lived under each earlier name, newest first. */
export const legacyDataDirsFor = (host: AppDirsHost): readonly { readonly name: string; readonly dir: string }[] =>
  LEGACY_APP_NAMES.map(({ name, slug }) => ({ name, dir: dataDirFor(host, name, slug) }));

/** Pure. `~/Library/Logs/Remry` on macOS; `<data dir>/Logs` on Windows; `<data dir>/logs` elsewhere. */
export const logsDirFor = (host: AppDirsHost): string => {
  if (host.platform === 'darwin') return join(host.home, 'Library', 'Logs', APP_NAME);
  if (host.platform === 'win32') return win32.join(dataDirFor(host), 'Logs');
  return join(dataDirFor(host), 'logs');
};

let resolvedDataDir: string | undefined;

/** Moves the data from each earlier folder in turn; stops at one that can't move yet and uses it. */
const moveFromLegacyDirs = (host: AppDirsHost): string => {
  const current = dataDirFor(host);
  for (const legacy of legacyDataDirsFor(host)) {
    const used = moveLegacyDataDir(legacy.dir, current, legacy.name);
    if (used !== current) return used;
  }
  return current;
};

/** The data directory, after moving it from its earlier names, once per process. */
export const appDataDir = (): string => {
  resolvedDataDir ??= moveFromLegacyDirs(currentHost());
  return resolvedDataDir;
};

export const appLogsDir = (): string => logsDirFor(currentHost());
