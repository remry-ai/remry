// When the MCP server starts (each Claude session): catches up after the clone changed
// version (a `git pull`), since Claude has no hook for a plugin install or update.
//   - `bun run setup` again, in the background, so the remry-dev plugin, the skill and
//     dist/remry.zip match the clone. Setup records what it ran for in <data dir>/setup.json.
//   - restarts the app if one this server started is still running an older version,
//     recorded in <data dir>/app.json when it started (startApp in app-launch.ts).
// The plan is pure; checkVersions does the I/O.

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appDataDir } from '../src/shared/settings/server/app-dirs';

/** What setup or an app start recorded: the plugin version, and for setup the clone it set up. */
export interface VersionMarker {
  readonly version: string;
  readonly repoDir?: string;
}

export interface VersionState {
  /** This clone's plugin version. */
  readonly version: string;
  readonly repoDir: string;
  readonly setup: VersionMarker | null;
  readonly app: VersionMarker | null;
  readonly appRunning: boolean;
}

export interface VersionPlan {
  readonly runSetup: boolean;
  readonly restartApp: boolean;
}

/**
 * Pure. Setup runs when it never has (an install from before this check) or ran for another
 * version of this clone. A clone other than the one setup recorded (run through
 * REMRY_HOME) is left alone, so two clones don't take the pointer back and forth.
 * The app restarts only when this server's record says it runs another version: a dev
 * server started by hand has no record, and is the user's to restart.
 */
export const planVersionCheck = (s: VersionState): VersionPlan => ({
  runSetup: s.setup === null || (s.setup.repoDir === s.repoDir && s.setup.version !== s.version),
  restartApp: s.appRunning && s.app !== null && s.app.version !== s.version
});

export const setupMarkerPath = (): string => join(appDataDir(), 'setup.json');
export const appMarkerPath = (): string => join(appDataDir(), 'app.json');
const SETUP_LOCK = (): string => join(appDataDir(), '.setup.lock');
const SETUP_LOG = (): string => join(appDataDir(), 'setup.log');
/** A setup lock older than this is from a run that died. */
const LOCK_STALE_MS = 10 * 60_000;

export const readMarker = async (path: string): Promise<VersionMarker | null> => {
  const parsed: unknown = await readFile(path, 'utf8').then((text) => JSON.parse(text) as unknown, () => null);
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { version, repoDir } = parsed as Record<string, unknown>;
  if (typeof version !== 'string') return null;
  return typeof repoDir === 'string' ? { version, repoDir } : { version };
};

export const writeMarker = async (path: string, marker: VersionMarker): Promise<void> => {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(marker, null, 2)}\n`);
};

/** Takes the setup lock, so two Claude apps starting at once run setup once. False if another run holds it. */
const takeSetupLock = (): boolean => {
  const lock = SETUP_LOCK();
  try {
    if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) unlinkSync(lock);
  } catch {
    // No lock yet.
  }
  // A fresh computer has no data directory yet.
  mkdirSync(appDataDir(), { recursive: true });
  try {
    closeSync(openSync(lock, 'wx'));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
};

/** Runs `bun run setup` detached, logging to <data dir>/setup.log; setup removes the lock when it ends. */
const runSetupInBackground = (repoDir: string, log: (message: string) => void): void => {
  if (!takeSetupLock()) return log('Remry setup is already running.');
  const out = openSync(SETUP_LOG(), 'a');
  // stdout must not reach this process's stdout, which carries the MCP protocol.
  const child = spawn(process.execPath, ['run', 'setup'], { cwd: repoDir, detached: true, stdio: ['ignore', out, out], windowsHide: true, env: { ...process.env, REMRY_SETUP_LOCK: SETUP_LOCK() } });
  child.on('error', (error) => log(`Couldn't run Remry setup: ${error.message}`));
  child.unref();
  closeSync(out);
  log(`Running \`bun run setup\` for this version; see ${SETUP_LOG()}.`);
};

export interface VersionCheckOptions {
  readonly version: string;
  readonly repoDir: string;
  readonly appRunning: () => Promise<boolean>;
  readonly restartApp: () => Promise<unknown>;
  readonly log: (message: string) => void;
}

export const checkVersions = async (o: VersionCheckOptions): Promise<VersionPlan> => {
  const plan = planVersionCheck({
    version: o.version,
    repoDir: o.repoDir,
    setup: await readMarker(setupMarkerPath()),
    app: await readMarker(appMarkerPath()),
    appRunning: await o.appRunning()
  });
  if (plan.runSetup) runSetupInBackground(o.repoDir, o.log);
  if (plan.restartApp) {
    o.log(`Restarting the Remry app for version ${o.version}.`);
    await o.restartApp();
  }
  return plan;
};
