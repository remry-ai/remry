// Moving the data directory from where it was under an earlier name (`Wonos`, and before
// that `Working Notes`; `wonos` and `working-notes` on Linux) to where it is now.
// Relative imports only — prisma.config.ts and scripts load this outside SvelteKit.
//
// Every move is a rename within one disk, so nothing is copied or deleted. App/ stays
// behind: it holds old versions of the binary, which an old backup LaunchAgent may
// still run (scripts/backup/launchd.ts replaces that agent).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Left in the old directory. */
const STAYS = new Set(['App', '.notebooks.lock']);

export const MOVED_NOTE = 'MOVED-TO-REMRY.txt';
/** The notes earlier renames left behind, which stay where they are. */
export const EARLIER_MOVED_NOTES: readonly string[] = ['MOVED-TO-WONOS.txt'];

/**
 * Pure. What to move: nothing unless the old directory has notebooks and the new one
 * doesn't. Notebooks first, so a move that fails part way leaves nothing behind that
 * matters. Entries the new directory already has (the plugin shim may have made App/)
 * stay where they are.
 */
export const planLegacyMove = (legacyEntries: readonly string[], currentEntries: readonly string[]): readonly string[] => {
  if (!legacyEntries.includes('Notebooks') || currentEntries.includes('Notebooks')) return [];
  const rest = legacyEntries.filter((e) => e !== 'Notebooks' && e !== MOVED_NOTE && !EARLIER_MOVED_NOTES.includes(e) && !STAYS.has(e) && !currentEntries.includes(e));
  return ['Notebooks', ...[...rest].sort()];
};

const entries = (dir: string): readonly string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/** Other processes holding a notebook's database open, from lsof (empty where there's no lsof). */
const databasesInUse = (legacy: string): boolean =>
  entries(join(legacy, 'Notebooks')).some((id) => {
    const db = join(legacy, 'Notebooks', id, 'working-notes.db');
    if (!existsSync(db)) return false;
    const result = spawnSync('lsof', ['-t', '--', db], { encoding: 'utf8' });
    if (result.error || typeof result.stdout !== 'string') return false;
    return result.stdout.split('\n').some((pid) => pid.trim() !== '' && pid.trim() !== String(process.pid));
  });

/**
 * Moves the data from `legacy` (the folder of `oldName`, such as Wonos) to `current` if
 * it's still there, and returns the directory to use: `current`, or `legacy` while the
 * move can't happen yet (an older app or MCP server still has a database open), so
 * nothing is lost meanwhile.
 */
export const moveLegacyDataDir = (legacy: string, current: string, oldName: string): string => {
  const plan = planLegacyMove(entries(legacy), entries(current));
  if (plan.length === 0) return current;

  // An older app that was just asked to stop may take a moment to let go.
  for (let attempt = 0; attempt < 4 && databasesInUse(legacy); attempt++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  if (databasesInUse(legacy)) {
    console.error(`${oldName} is now Remry, and its data moves to ${current} once nothing older uses it. Quit the ${oldName} app and restart Claude to finish.`);
    return legacy;
  }

  mkdirSync(current, { recursive: true });
  for (const entry of plan) {
    try {
      renameSync(join(legacy, entry), join(current, entry));
    } catch (error) {
      // Another process starting at the same time may have just moved it.
      if (entry === 'Notebooks' && !existsSync(join(current, 'Notebooks'))) {
        console.error(`${oldName} is now Remry, but its data couldn't move to ${current} yet (${(error as Error).message}). Quit the ${oldName} app and restart Claude to finish.`);
        return legacy;
      }
      if (existsSync(join(legacy, entry))) console.error(`Couldn't move ${entry} to ${current}: ${(error as Error).message}`);
    }
  }
  try {
    writeFileSync(
      join(legacy, MOVED_NOTE),
      `${oldName} is now Remry, and your notebooks, backups and settings are in\n${current}\n\nApp/ holds older versions of the app. Once Remry is working, you can delete this folder.\n`
    );
  } catch {
    // Only a note.
  }
  console.error(`${oldName} is now Remry: moved your data to ${current}.`);
  return current;
};
